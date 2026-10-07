import { useStore, type Theme } from '../store'

const THEMES: { value: Theme; label: string }[] = [
	{ value: 'system', label: 'Follow system' },
	{ value: 'light', label: 'Light' },
	{ value: 'dark', label: 'Dark' }
]

export function GeneralPanel(): React.JSX.Element {
	const theme = useStore((s) => s.theme)
	const showExplorer = useStore((s) => s.showExplorer)
	const showPreview = useStore((s) => s.showPreview)
	const showHidden = useStore((s) => s.showHidden)
	const state = (): ReturnType<typeof useStore.getState> => useStore.getState()

	return (
		<div className="settings-general">
			<label className="settings-field">
				<span>Theme</span>
				<select value={theme} onChange={(event) => state().setTheme(event.target.value as Theme)}>
					{THEMES.map((item) => (
						<option key={item.value} value={item.value}>
							{item.label}
						</option>
					))}
				</select>
			</label>
			<label className="settings-field">
				<span>Show explorer</span>
				<input type="checkbox" checked={showExplorer} onChange={() => state().toggle('showExplorer')} />
			</label>
			<label className="settings-field">
				<span>Show preview panel</span>
				<input type="checkbox" checked={showPreview} onChange={() => state().toggle('showPreview')} />
			</label>
			<label className="settings-field">
				<span>Show hidden files</span>
				<input type="checkbox" checked={showHidden} onChange={() => state().toggle('showHidden')} />
			</label>
		</div>
	)
}
