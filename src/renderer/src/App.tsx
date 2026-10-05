import { useEffect } from 'react'
import { Allotment } from 'allotment'
import { useStore } from './store'
import { Explorer } from './components/Explorer'
import { Palette } from './components/Palette'
import { PreviewPanel } from './components/PreviewPanel'
import { StatusBar } from './components/StatusBar'
import { TabBar } from './components/TabBar'
import { TabContent } from './components/TabContent'

export function App(): React.JSX.Element {
	const ready = useStore((s) => s.tabs.length > 0)
	const showExplorer = useStore((s) => s.showExplorer)
	const showPreview = useStore((s) => s.showPreview)
	const theme = useStore((s) => s.theme)
	const mac = useStore((s) => s.app?.platform === 'darwin')

	useEffect(() => {
		void useStore.getState().init()
	}, [])

	useEffect(() => {
		document.documentElement.dataset.theme = theme
	}, [theme])

	useEffect(() => {
		const onKey = (event: KeyboardEvent): void => {
			const mod = mac ? event.metaKey : event.ctrlKey
			if (mod && event.shiftKey && event.key.toLowerCase() === 'p') {
				event.preventDefault()
				useStore.getState().toggle('paletteOpen')
			} else if (mod && event.key.toLowerCase() === 't') {
				event.preventDefault()
				useStore.getState().newTab()
			} else if (mod && event.key.toLowerCase() === 'b') {
				event.preventDefault()
				useStore.getState().toggle('showExplorer')
			} else if (mod && event.key.toLowerCase() === 'd') {
				event.preventDefault()
				useStore.getState().split(event.shiftKey ? 'column' : 'row')
			}
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [mac])

	return (
		<div className="app">
			<TabBar />
			<div className="main">
				<Allotment>
					{showExplorer && (
						<Allotment.Pane minSize={160} preferredSize={260} maxSize={520}>
							<Explorer />
						</Allotment.Pane>
					)}
					<Allotment.Pane minSize={320}>{ready ? <TabContent /> : <div className="welcome muted pad">Starting&hellip;</div>}</Allotment.Pane>
					{showPreview && (
						<Allotment.Pane minSize={200} preferredSize={340}>
							<PreviewPanel />
						</Allotment.Pane>
					)}
				</Allotment>
			</div>
			<StatusBar />
			<Palette />
		</div>
	)
}
