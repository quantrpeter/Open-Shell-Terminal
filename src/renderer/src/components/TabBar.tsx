import { basename } from '../../../shared/paths'
import { useStore } from '../store'

export function TabBar(): React.JSX.Element {
	const tabs = useStore((s) => s.tabs)
	const panes = useStore((s) => s.panes)
	const activeId = useStore((s) => s.activeTabId)
	const mac = useStore((s) => s.app?.platform === 'darwin')
	const state = (): ReturnType<typeof useStore.getState> => useStore.getState()

	return (
		<div className={mac ? 'tabbar mac' : 'tabbar'}>
			<div className="tabs" role="tablist">
				{tabs.map((tab) => {
					const cwd = panes[tab.activePaneId]?.cwd ?? ''
					const title = basename(cwd) || cwd || 'shell'
					return (
						<div
							key={tab.id}
							role="tab"
							aria-selected={tab.id === activeId}
							className={tab.id === activeId ? 'tab active' : 'tab'}
							onClick={() => state().selectTab(tab.id)}
							title={cwd}
						>
							<span className="tab-title">{title}</span>
							<button
								className="tab-close"
								title="Close tab"
								onClick={(event) => {
									event.stopPropagation()
									state().closeTab(tab.id)
								}}
							>
								&times;
							</button>
						</div>
					)
				})}
				<button className="icon-btn" title="New tab" onClick={() => state().newTab()}>
					+
				</button>
			</div>
			<div className="tabbar-actions">
				<button className="icon-btn" title="Split right" onClick={() => state().split('row')}>
					&#9707;
				</button>
				<button className="icon-btn" title="Split down" onClick={() => state().split('column')}>
					&#9708;
				</button>
				<button className="icon-btn" title="Command palette" onClick={() => state().toggle('paletteOpen')}>
					&#8984;
				</button>
			</div>
		</div>
	)
}
