import { Command } from 'cmdk'
import { useStore } from '../store'

export function Palette(): React.JSX.Element {
	const open = useStore((s) => s.paletteOpen)
	const commands = useStore((s) => s.commands)
	const app = useStore((s) => s.app)
	const state = useStore.getState()
	const close = (): void => useStore.setState({ paletteOpen: false })
	const act = (fn: () => void) => (): void => {
		close()
		fn()
	}

	return (
		<Command.Dialog open={open} onOpenChange={(value) => useStore.setState({ paletteOpen: value })} label="Command palette">
			<Command.Input placeholder="Type a command or search" />
			<Command.List>
				<Command.Empty>No results.</Command.Empty>
				<Command.Group heading="Actions">
					<Command.Item onSelect={act(() => state.newTab())}>New tab</Command.Item>
					<Command.Item onSelect={act(() => state.split('row'))}>Split right</Command.Item>
					<Command.Item onSelect={act(() => state.split('column'))}>Split down</Command.Item>
					<Command.Item
						onSelect={act(() => {
							const tab = useStore.getState().tabs.find((t) => t.id === useStore.getState().activeTabId)
							if (tab) useStore.getState().closePane(tab.activePaneId)
						})}
					>
						Close pane
					</Command.Item>
					<Command.Item onSelect={act(() => state.toggle('showExplorer'))}>Toggle explorer</Command.Item>
					<Command.Item onSelect={act(() => state.toggle('showPreview'))}>Toggle preview</Command.Item>
					<Command.Item onSelect={act(() => state.toggle('showHidden'))}>Toggle hidden files</Command.Item>
					<Command.Item onSelect={act(() => state.setTheme('light'))}>Theme: light</Command.Item>
					<Command.Item onSelect={act(() => state.setTheme('dark'))}>Theme: dark</Command.Item>
					<Command.Item onSelect={act(() => state.setTheme('system'))}>Theme: follow system</Command.Item>
					<Command.Item onSelect={act(() => state.runInActive('clear'))}>Clear pane</Command.Item>
					{app && <Command.Item onSelect={act(() => state.cd(app.home))}>Go to home folder</Command.Item>}
				</Command.Group>
				<Command.Group heading="Run a shell command">
					{commands.map((cmd) => (
						<Command.Item
							key={cmd.name}
							value={`${cmd.name} ${cmd.summary}`}
							onSelect={act(() => state.insertIntoPrompt(cmd.name + ' '))}
						>
							<span className="palette-name">{cmd.name}</span>
							<span className="muted">{cmd.summary}</span>
						</Command.Item>
					))}
				</Command.Group>
			</Command.List>
		</Command.Dialog>
	)
}
