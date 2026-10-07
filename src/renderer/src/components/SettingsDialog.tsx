import { useEffect } from 'react'
import { useStore, type SettingsTab } from '../store'
import { EnvironmentPanel } from './EnvironmentPanel'
import { GeneralPanel } from './GeneralPanel'
import { PythonPanel } from './PythonPanel'

const TABS: { id: SettingsTab; label: string }[] = [
	{ id: 'general', label: 'General' },
	{ id: 'python', label: 'Python' },
	{ id: 'environment', label: 'Environment' }
]

export function SettingsDialog(): React.JSX.Element {
	const close = (): void => useStore.setState({ settingsOpen: false })
	const tab = useStore((s) => s.settingsTab)

	useEffect(() => {
		const onKey = (event: KeyboardEvent): void => {
			if (event.key === 'Escape') {
				event.preventDefault()
				event.stopPropagation()
				close()
			}
		}
		window.addEventListener('keydown', onKey, true)
		return () => window.removeEventListener('keydown', onKey, true)
	}, [])

	return (
		<div className="settings-overlay" onMouseDown={close}>
			<div className="settings-dialog" role="dialog" aria-label="Settings" onMouseDown={(event) => event.stopPropagation()}>
				<div className="settings-head">
					<span>Settings</span>
					<button type="button" className="icon-btn" onClick={close} title="Close">
						×
					</button>
				</div>
				<div className="settings-tabs" role="tablist">
					{TABS.map((item) => (
						<button
							key={item.id}
							type="button"
							role="tab"
							aria-selected={tab === item.id}
							className={tab === item.id ? 'settings-tab active' : 'settings-tab'}
							onClick={() => useStore.setState({ settingsTab: item.id })}
						>
							{item.label}
						</button>
					))}
				</div>
				{tab === 'general' && <GeneralPanel />}
				{tab === 'python' && <PythonPanel />}
				{tab === 'environment' && <EnvironmentPanel />}
			</div>
		</div>
	)
}
