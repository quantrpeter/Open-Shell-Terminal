import { useStore, type Theme } from '../store'

const NEXT: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' }

export function StatusBar(): React.JSX.Element {
	const version = useStore((s) => s.version)
	const python = useStore((s) => s.python)
	const platform = useStore((s) => s.app?.platform ?? '')
	const theme = useStore((s) => s.theme)
	const cwd = useStore((s) => {
		const tab = s.tabs.find((item) => item.id === s.activeTabId)
		return tab ? (s.panes[tab.activePaneId]?.cwd ?? '') : ''
	})
	const running = useStore((s) =>
		Object.values(s.panes).reduce((sum, pane) => sum + pane.blocks.filter((b) => b.status === 'running').length, 0)
	)
	const showExplorer = useStore((s) => s.showExplorer)
	const hint = useStore((s) => s.app?.engineHint ?? '')
	const state = (): ReturnType<typeof useStore.getState> => useStore.getState()

	return (
		<div className="statusbar">
			<button
				className={showExplorer ? 'status-btn active' : 'status-btn'}
				onClick={() => state().toggle('showExplorer')}
				title="Toggle explorer"
			>
				Explorer
			</button>
			<button className="status-btn" onClick={() => state().toggle('showPreview')} title="Toggle preview">
				Preview
			</button>
			<span className="status-cwd" title={cwd}>
				{cwd}
			</span>
			{hint && <span className="status-warn">{hint}</span>}
			{running > 0 && <span className="status-running">{running} running</span>}
			<button className="status-btn" onClick={() => state().setTheme(NEXT[theme])} title="Theme">
				Theme: {theme}
			</button>
			<button
				className="status-btn"
				onClick={() => state().toggle('pythonOpen')}
				title={python?.path || 'Choose the Python that runs Open Shell'}
			>
				{python?.version ? `Python ${python.version}` : 'Python'}
			</button>
			<span className="muted">
				{version ? `Open Shell ${version}` : ''} {platform}
			</span>
		</div>
	)
}
