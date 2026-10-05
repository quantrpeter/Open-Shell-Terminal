import { create } from 'zustand'
import type { AppInfo, CommandInfo, EngineInfo, PaneEvent, RunSummary, ShellErrorRecord } from '../../shared/types'
import { isUnder } from '../../shared/paths'
import { shellQuote } from '../../shared/quote'
import { paneIds, removePane, splitPane, type Direction, type LayoutNode } from './lib/layout'

export type BlockStatus = 'running' | 'done' | 'failed' | 'cancelled'
export type Theme = 'system' | 'light' | 'dark'

export interface Block {
	id: string
	line: string
	cwd: string
	status: BlockStatus
	// Mutated in place while streaming; `version` tells views to re-read it.
	records: unknown[]
	version: number
	errors: ShellErrorRecord[]
	summary?: RunSummary
}

export interface Pane {
	id: string
	cwd: string
	blocks: Block[]
	history: string[]
	ready: boolean
	error?: string
}

export interface Tab {
	id: string
	layout: LayoutNode
	activePaneId: string
}

interface PromptInsert {
	paneId: string
	text: string
	nonce: number
}

interface Store {
	app: AppInfo | null
	commands: CommandInfo[]
	version: string
	tabs: Tab[]
	activeTabId: string
	panes: Record<string, Pane>
	explorerRoot: string
	showExplorer: boolean
	showPreview: boolean
	showHidden: boolean
	previewPath: string | null
	theme: Theme
	paletteOpen: boolean
	promptInsert: PromptInsert | null

	init(): Promise<void>
	newTab(cwd?: string): void
	closeTab(tabId: string): void
	selectTab(tabId: string): void
	split(dir: Direction, cwd?: string): void
	closePane(paneId: string): void
	focusPane(paneId: string): void
	run(paneId: string, line: string): void
	runInActive(line: string): void
	cd(path: string): void
	cancel(paneId: string, blockId: string): void
	clear(paneId: string): void
	removeBlock(paneId: string, blockId: string): void
	insertIntoPrompt(text: string): void
	setExplorerRoot(path: string): void
	setPreview(path: string | null): void
	setTheme(theme: Theme): void
	toggle(key: 'showExplorer' | 'showPreview' | 'showHidden' | 'paletteOpen'): void
}

let counter = 0
let initialized = false
export const uid = (prefix: string): string => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`

const storedTheme = (): Theme => {
	const value = localStorage.getItem('oshell-theme')
	return value === 'light' || value === 'dark' ? value : 'system'
}

export const useStore = create<Store>((set, get) => {
	const activeTab = (): Tab => get().tabs.find((tab) => tab.id === get().activeTabId)!
	const activePaneId = (): string => activeTab().activePaneId

	const patchPane = (paneId: string, patch: (pane: Pane) => Pane): void =>
		set((state) => (state.panes[paneId] ? { panes: { ...state.panes, [paneId]: patch(state.panes[paneId]) } } : {}))

	const patchBlock = (paneId: string, blockId: string, patch: (block: Block) => Block): void =>
		patchPane(paneId, (pane) => ({
			...pane,
			blocks: pane.blocks.map((block) => (block.id === blockId ? patch(block) : block))
		}))

	// Start an engine for a new pane and register it in the store.
	const openPane = (paneId: string, cwd: string): void => {
		set((state) => ({
			panes: { ...state.panes, [paneId]: { id: paneId, cwd, blocks: [], history: [], ready: false } }
		}))
		void window.oshell.pane
			.open(paneId, cwd)
			.then(async (info: EngineInfo) => {
				const history = await window.oshell.pane.history(paneId).catch(() => [] as string[])
				patchPane(paneId, (pane) => ({ ...pane, cwd: info.cwd, ready: true, history }))
				set((state) => ({ commands: info.commands, version: info.version, explorerRoot: state.explorerRoot || info.home }))
				if (info.problems.length > 0) {
					patchPane(paneId, (pane) => ({
						...pane,
						blocks: [
							...pane.blocks,
							{
								id: uid('b'),
								line: 'startup',
								cwd: info.cwd,
								status: 'failed',
								records: [],
								version: 0,
								errors: info.problems
							}
						]
					}))
				}
			})
			.catch((error: unknown) => {
				const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error)
				patchPane(paneId, (pane) => ({ ...pane, error: message }))
			})
	}

	const handleEvent = ({ paneId, runId, event }: PaneEvent): void => {
		patchBlock(paneId, runId, (block) => {
			if (event.type === 'records') {
				for (const record of event.data) block.records.push(record)
				return { ...block, version: block.version + 1 }
			}
			if (event.type === 'error') return { ...block, errors: [...block.errors, event.error] }
			const status: BlockStatus = event.result.cancelled ? 'cancelled' : event.result.failed ? 'failed' : 'done'
			return { ...block, status, summary: event.result, version: block.version + 1 }
		})
		if (event.type === 'done' && event.result.cwd) {
			patchPane(paneId, (pane) => ({ ...pane, cwd: event.result.cwd }))
		}
	}

	return {
		app: null,
		commands: [],
		version: '',
		tabs: [],
		activeTabId: '',
		panes: {},
		explorerRoot: '',
		showExplorer: true,
		showPreview: false,
		showHidden: false,
		previewPath: null,
		theme: storedTheme(),
		paletteOpen: false,
		promptInsert: null,

		async init() {
			if (initialized) return
			initialized = true
			const app = await window.oshell.app.info()
			set({ app, explorerRoot: app.home })
			window.oshell.pane.onEvent(handleEvent)
			get().newTab(app.home)
		},

		newTab(cwd) {
			const tabId = uid('t')
			const paneId = uid('p')
			const current = get().tabs.length ? get().panes[activePaneId()]?.cwd : undefined
			const start = cwd ?? current ?? get().app?.home ?? ''
			set((state) => ({
				tabs: [...state.tabs, { id: tabId, layout: { kind: 'pane', paneId }, activePaneId: paneId }],
				activeTabId: tabId
			}))
			openPane(paneId, start)
		},

		closeTab(tabId) {
			const tab = get().tabs.find((item) => item.id === tabId)
			if (!tab) return
			for (const id of paneIds(tab.layout)) void window.oshell.pane.close(id)
			const rest = get().tabs.filter((item) => item.id !== tabId)
			const panes = { ...get().panes }
			for (const id of paneIds(tab.layout)) delete panes[id]
			set({ tabs: rest, panes, activeTabId: get().activeTabId === tabId ? (rest.at(-1)?.id ?? '') : get().activeTabId })
			if (rest.length === 0) get().newTab(get().app?.home)
		},

		selectTab(tabId) {
			set({ activeTabId: tabId })
		},

		split(dir, cwd) {
			const tab = activeTab()
			const target = tab.activePaneId
			const paneId = uid('p')
			const start = cwd ?? get().panes[target]?.cwd ?? get().app?.home ?? ''
			set((state) => ({
				tabs: state.tabs.map((item) =>
					item.id === tab.id
						? { ...item, layout: splitPane(item.layout, target, dir, paneId), activePaneId: paneId }
						: item
				)
			}))
			openPane(paneId, start)
		},

		closePane(paneId) {
			const tab = get().tabs.find((item) => paneIds(item.layout).includes(paneId))
			if (!tab) return
			const layout = removePane(tab.layout, paneId)
			if (!layout) {
				get().closeTab(tab.id)
				return
			}
			void window.oshell.pane.close(paneId)
			const panes = { ...get().panes }
			delete panes[paneId]
			set((state) => ({
				panes,
				tabs: state.tabs.map((item) =>
					item.id === tab.id
						? { ...item, layout, activePaneId: item.activePaneId === paneId ? paneIds(layout)[0] : item.activePaneId }
						: item
				)
			}))
		},

		focusPane(paneId) {
			set((state) => ({
				tabs: state.tabs.map((tab) => (paneIds(tab.layout).includes(paneId) ? { ...tab, activePaneId: paneId } : tab))
			}))
		},

		run(paneId, line) {
			const text = line.trim()
			const pane = get().panes[paneId]
			if (!text || !pane) return
			if (text === 'clear') {
				get().clear(paneId)
				return
			}
			const block: Block = {
				id: uid('b'),
				line: text,
				cwd: pane.cwd,
				status: 'running',
				records: [],
				version: 0,
				errors: []
			}
			patchPane(paneId, (item) => ({
				...item,
				blocks: [...item.blocks, block],
				history: item.history.at(-1) === text ? item.history : [...item.history, text]
			}))
			void window.oshell.pane.run(paneId, block.id, text)
		},

		runInActive(line) {
			get().run(activePaneId(), line)
		},

		cd(path) {
			const windows = get().app?.platform === 'win32'
			get().runInActive(`cd ${shellQuote(path, windows)}`)
		},

		cancel(paneId, blockId) {
			void window.oshell.pane.cancel(paneId, blockId)
		},

		clear(paneId) {
			patchPane(paneId, (pane) => ({ ...pane, blocks: pane.blocks.filter((block) => block.status === 'running') }))
		},

		removeBlock(paneId, blockId) {
			void window.oshell.pane.cancel(paneId, blockId)
			patchPane(paneId, (pane) => ({ ...pane, blocks: pane.blocks.filter((block) => block.id !== blockId) }))
		},

		insertIntoPrompt(text) {
			set({ promptInsert: { paneId: activePaneId(), text, nonce: Date.now() } })
		},

		setExplorerRoot(path) {
			set({ explorerRoot: path })
		},

		setPreview(path) {
			set({ previewPath: path, showPreview: path !== null ? true : get().showPreview })
		},

		setTheme(theme) {
			localStorage.setItem('oshell-theme', theme)
			set({ theme })
		},

		toggle(key) {
			set((state) => ({ [key]: !state[key] }) as Pick<Store, typeof key>)
		}
	}
})

// The directory the explorer should show: keep the root while the cwd is inside it.
export function rootFor(root: string, cwd: string): string {
	if (!root) return cwd
	return isUnder(root, cwd) ? root : cwd
}
