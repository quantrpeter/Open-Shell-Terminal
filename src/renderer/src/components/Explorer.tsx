import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { DirEntry } from '../../../shared/types'
import { breadcrumbs, chain, dirname, isUnder, samePath } from '../../../shared/paths'
import { shellQuote } from '../../../shared/quote'
import { useStore } from '../store'

type Listing = { state: 'loading' } | { state: 'ready'; entries: DirEntry[] } | { state: 'error'; message: string }

interface Row {
	path: string
	name: string
	depth: number
	isDir: boolean
	expanded: boolean
	listing?: Listing
}

const ROW_HEIGHT = 24

function useActiveCwd(): string {
	return useStore((s) => {
		const tab = s.tabs.find((item) => item.id === s.activeTabId)
		return tab ? (s.panes[tab.activePaneId]?.cwd ?? '') : ''
	})
}

export function Explorer(): React.JSX.Element {
	const root = useStore((s) => s.explorerRoot)
	const showHidden = useStore((s) => s.showHidden)
	const windows = useStore((s) => s.app?.platform === 'win32')
	const home = useStore((s) => s.app?.home ?? '')
	const { setExplorerRoot, cd, setPreview, toggle, newTab, split, insertIntoPrompt } = useStore.getState()
	const cwd = useActiveCwd()

	const [expanded, setExpanded] = useState<Set<string>>(new Set())
	const [listings, setListings] = useState<Map<string, Listing>>(new Map())
	const [menu, setMenu] = useState<{ x: number; y: number; row: Row } | null>(null)
	const scroller = useRef<HTMLDivElement>(null)
	const hiddenRef = useRef(showHidden)
	hiddenRef.current = showHidden
	// Directories already requested; keeps effects from loading the same one twice.
	const requested = useRef(new Set<string>())

	const load = useCallback((dir: string, quiet = false) => {
		if (!quiet) setListings((prev) => new Map(prev).set(dir, { state: 'loading' }))
		window.oshell.fs
			.list(dir, hiddenRef.current)
			.then((entries) => setListings((prev) => new Map(prev).set(dir, { state: 'ready', entries })))
			.catch((err: unknown) =>
				setListings((prev) =>
					new Map(prev).set(dir, { state: 'error', message: err instanceof Error ? err.message : String(err) })
				)
			)
	}, [])

	// New root (or hidden-files toggle): start over from the root.
	useEffect(() => {
		if (!root) return
		requested.current = new Set([root])
		setListings(new Map())
		setExpanded(new Set([root]))
		load(root)
	}, [root, showHidden, load])

	const ensure = useCallback(
		(dir: string): void => {
			if (requested.current.has(dir)) return
			requested.current.add(dir)
			load(dir)
		},
		[load]
	)

	// The cwd left the tree: re-root there. Otherwise open its ancestors.
	useEffect(() => {
		if (!root || !cwd) return
		if (!isUnder(root, cwd)) {
			setExplorerRoot(cwd)
			return
		}
		const parents = chain(root, cwd)
		setExpanded((prev) => {
			if (parents.every((dir) => prev.has(dir))) return prev
			return new Set([...prev, ...parents])
		})
		for (const dir of parents) ensure(dir)
	}, [cwd, root, showHidden, ensure, setExplorerRoot])

	useEffect(() => {
		void window.oshell.fs.setWatched([...expanded])
	}, [expanded])

	useEffect(
		() =>
			window.oshell.fs.onChanged((dir) => {
				if (requested.current.has(dir)) load(dir, true)
			}),
		[load]
	)

	const rows = useMemo(() => {
		const result: Row[] = []
		const walk = (dir: string, name: string, depth: number): void => {
			const open = expanded.has(dir)
			const listing = listings.get(dir)
			result.push({ path: dir, name, depth, isDir: true, expanded: open, listing })
			if (!open || listing?.state !== 'ready') return
			for (const entry of listing.entries) {
				if (entry.isDir) walk(entry.path, entry.name, depth + 1)
				else result.push({ path: entry.path, name: entry.name, depth: depth + 1, isDir: false, expanded: false })
			}
		}
		if (root) walk(root, root, 0)
		return result
	}, [root, expanded, listings])

	const virtualizer = useVirtualizer({
		count: rows.length,
		getScrollElement: () => scroller.current,
		estimateSize: () => ROW_HEIGHT,
		overscan: 12
	})

	// Scroll to the cwd row once it exists (its ancestors load asynchronously).
	const revealPending = useRef(true)
	useEffect(() => {
		revealPending.current = true
	}, [cwd, root])
	useEffect(() => {
		if (!revealPending.current) return
		const index = rows.findIndex((row) => row.isDir && samePath(row.path, cwd))
		if (index < 0) return
		revealPending.current = false
		virtualizer.scrollToIndex(index, { align: 'center' })
	}, [rows, cwd, virtualizer])

	const toggleDir = (row: Row): void => {
		if (expanded.has(row.path)) {
			setExpanded((prev) => {
				const next = new Set(prev)
				next.delete(row.path)
				return next
			})
			return
		}
		setExpanded((prev) => new Set(prev).add(row.path))
		ensure(row.path)
	}

	const activate = (row: Row): void => {
		if (!row.isDir) {
			setPreview(row.path)
			return
		}
		if (!expanded.has(row.path)) toggleDir(row)
		if (!samePath(row.path, cwd)) cd(row.path)
	}

	const copyPath = (path: string): void => void navigator.clipboard.writeText(path)
	const quoted = (path: string): string => shellQuote(path, windows)

	const menuItems = (row: Row): { label: string; run: () => void }[] => {
		const dirPath = row.isDir ? row.path : dirname(row.path)
		const items = [
			{ label: 'Open in new tab', run: () => newTab(dirPath) },
			{ label: 'Open in split', run: () => split('row', dirPath) },
			{ label: 'Insert path in prompt', run: () => insertIntoPrompt(quoted(row.path)) },
			{ label: 'Copy path', run: () => copyPath(row.path) },
			{ label: 'Reveal in file manager', run: () => void window.oshell.fs.reveal(row.path) }
		]
		if (row.isDir) items.push({ label: 'Set as root', run: () => setExplorerRoot(row.path) })
		else items.push({ label: 'Open with default app', run: () => void window.oshell.fs.open(row.path) })
		return items
	}

	useEffect(() => {
		if (!menu) return
		const close = (): void => setMenu(null)
		const onKey = (event: KeyboardEvent): void => {
			if (event.key === 'Escape') close()
		}
		window.addEventListener('click', close)
		window.addEventListener('blur', close)
		window.addEventListener('keydown', onKey)
		return () => {
			window.removeEventListener('click', close)
			window.removeEventListener('blur', close)
			window.removeEventListener('keydown', onKey)
		}
	}, [menu])

	const crumbs = root ? breadcrumbs(root) : []

	return (
		<div className="explorer">
			<div className="explorer-head">
				<span className="explorer-title">Explorer</span>
				<button className="icon-btn" title="Parent folder as root" onClick={() => setExplorerRoot(dirname(root))}>
					&#8593;
				</button>
				<button className="icon-btn" title="Home as root" onClick={() => setExplorerRoot(home)}>
					&#8962;
				</button>
				<button
					className={showHidden ? 'icon-btn active' : 'icon-btn'}
					title="Show hidden files"
					onClick={() => toggle('showHidden')}
				>
					.*
				</button>
			</div>
			<div className="crumbs" title={root}>
				{crumbs.map((crumb, index) => (
					<span key={crumb.path}>
						{index > 0 && !/[\\/]$/.test(crumbs[index - 1].name) && <span className="crumb-sep">/</span>}
						<button className="crumb" onClick={() => setExplorerRoot(crumb.path)}>
							{crumb.name}
						</button>
					</span>
				))}
			</div>
			<div className="tree" ref={scroller}>
				<div className="tree-inner" style={{ height: virtualizer.getTotalSize() }}>
					{virtualizer.getVirtualItems().map((item) => {
						const row = rows[item.index]
						const current = row.isDir && samePath(row.path, cwd)
						return (
							<div
								key={row.path}
								className={current ? 'tree-row current' : 'tree-row'}
								style={{ transform: `translateY(${item.start}px)`, height: ROW_HEIGHT, paddingLeft: 8 + row.depth * 14 }}
								draggable
								onDragStart={(event) => {
									event.dataTransfer.setData('text/plain', quoted(row.path))
									event.dataTransfer.effectAllowed = 'copy'
								}}
								onClick={() => activate(row)}
								onDoubleClick={() => !row.isDir && void window.oshell.fs.open(row.path)}
								onContextMenu={(event) => {
									event.preventDefault()
									setMenu({ x: event.clientX, y: event.clientY, row })
								}}
								title={row.path}
							>
								<span
									className="chevron"
									onClick={(event) => {
										event.stopPropagation()
										if (row.isDir) toggleDir(row)
									}}
								>
									{row.isDir ? (row.expanded ? '\u25be' : '\u25b8') : ''}
								</span>
								<span className={row.isDir ? 'file-icon dir' : 'file-icon'}>{row.isDir ? '\u25a0' : '\u25a1'}</span>
								<span className="tree-name">{row.depth === 0 ? row.name.split(/[\\/]/).filter(Boolean).pop() || row.name : row.name}</span>
								{row.listing?.state === 'loading' && <span className="tree-note">&hellip;</span>}
								{row.listing?.state === 'error' && (
									<span className="tree-note error" title={row.listing.message}>
										!
									</span>
								)}
							</div>
						)
					})}
				</div>
			</div>
			{menu && (
				<div className="menu" style={{ left: menu.x, top: menu.y }}>
					{menuItems(menu.row).map((item) => (
						<button key={item.label} className="menu-item" onClick={item.run}>
							{item.label}
						</button>
					))}
				</div>
			)}
		</div>
	)
}
