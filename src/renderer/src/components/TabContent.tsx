import { useEffect, useRef } from 'react'
import { Allotment } from 'allotment'
import { basename } from '../../../shared/paths'
import type { LayoutNode } from '../lib/layout'
import { useStore } from '../store'
import { BlockView } from './BlockView'
import { Icon } from './Icon'
import { Prompt } from './Prompt'

function PaneView({ paneId }: { paneId: string }): React.JSX.Element {
	const pane = useStore((s) => s.panes[paneId])
	const active = useStore((s) => s.tabs.some((tab) => tab.id === s.activeTabId && tab.activePaneId === paneId))
	const multiple = useStore((s) => (s.tabs.find((tab) => tab.id === s.activeTabId)?.layout.kind ?? 'pane') === 'split')
	const { focusPane, closePane } = useStore.getState()
	const scroller = useRef<HTMLDivElement>(null)
	const stick = useRef(true)

	const version = pane?.blocks.reduce((sum, block) => sum + block.version + block.errors.length + 1, 0) ?? 0
	useEffect(() => {
		const el = scroller.current
		if (el && stick.current) el.scrollTop = el.scrollHeight
	}, [version])

	if (!pane) return <div className="pane" />

	return (
		<div className={active && multiple ? 'pane focused' : 'pane'} onMouseDown={() => focusPane(paneId)}>
			{multiple && (
				<div className="pane-head">
					<span title={pane.cwd}>{basename(pane.cwd) || pane.cwd}</span>
					<button className="icon-btn" title="Close pane" onClick={() => closePane(paneId)}>
						<Icon name="close" />
					</button>
				</div>
			)}
			<div
				className="blocks"
				ref={scroller}
				onScroll={(event) => {
					const el = event.currentTarget
					stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
				}}
				onClick={(event) => {
					// Clicking empty space puts the cursor back in the prompt.
					if (window.getSelection()?.toString()) return
					if ((event.target as HTMLElement).closest('button, input, th, .link')) return
					scroller.current?.querySelector<HTMLInputElement>('.prompt-input')?.focus()
				}}
			>
				{pane.error ? (
					<div className="error">
						<div>Cannot start the Open Shell engine.</div>
						<pre className="raw">{pane.error}</pre>
					</div>
				) : pane.blocks.length === 0 ? (
					<div className="welcome muted" style={{display: pane.ready ? 'none' : 'block'}}>
						Starting engine\u2026
					</div>
				) : null}
				{pane.blocks.map((block) => (
					<BlockView key={block.id} paneId={paneId} block={block} />
				))}
				<Prompt paneId={paneId} />
			</div>
		</div>
	)
}

function Layout({ node }: { node: LayoutNode }): React.JSX.Element {
	if (node.kind === 'pane') return <PaneView paneId={node.paneId} />
	return (
		<Allotment vertical={node.dir === 'column'}>
			{node.children.map((child, index) => (
				<Allotment.Pane key={child.kind === 'pane' ? child.paneId : `s${index}`} minSize={160}>
					<Layout node={child} />
				</Allotment.Pane>
			))}
		</Allotment>
	)
}

export function TabContent(): React.JSX.Element {
	const tabs = useStore((s) => s.tabs)
	const activeId = useStore((s) => s.activeTabId)
	return (
		<>
			{tabs.map((tab) => (
				<div key={tab.id} className="tab-content" hidden={tab.id !== activeId}>
					<Layout node={tab.layout} />
				</div>
			))}
		</>
	)
}
