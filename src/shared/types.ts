// Types shared by the main process, the preload bridge and the renderer.

export interface ShellErrorRecord {
	$t?: 'error'
	code: string
	message: string
	hint?: string
}

export interface CommandInfo {
	name: string
	summary: string
	usage: string
	origin: string
}

export interface EngineInfo {
	protocol: number
	version: string
	platform: string
	sep: string
	home: string
	cwd: string
	commands: CommandInfo[]
	problems: ShellErrorRecord[]
}

export interface RunSummary {
	count: number
	ms: number
	cwd: string
	failed: boolean
	cancelled: boolean
}

export type RunStreamEvent =
	| { type: 'records'; data: unknown[] }
	| { type: 'error'; error: ShellErrorRecord }
	| { type: 'done'; result: RunSummary }

export interface PaneEvent {
	paneId: string
	runId: string
	event: RunStreamEvent
}

export interface CompleteResult {
	start: number
	end: number
	items: string[]
}

export interface Setting {
	name: string
	value: unknown
}

export interface DirEntry {
	name: string
	path: string
	isDir: boolean
	hidden: boolean
}

export type Preview =
	| { kind: 'text'; name: string; size: number; text: string; truncated: boolean; ext: string }
	| { kind: 'image'; name: string; size: number; dataUrl: string }
	| { kind: 'binary'; name: string; size: number }
	| { kind: 'too-large'; name: string; size: number }
	| { kind: 'dir'; name: string }
	| { kind: 'error'; name: string; message: string }

export interface PythonRuntime {
	path: string
	version: string
	label: string
	source: 'selected' | 'default' | 'bundled' | 'path'
}

export interface AppInfo {
	platform: NodeJS.Platform
	home: string
	sep: string
	engineHint: string
	python: PythonRuntime
	runtimes: PythonRuntime[]
}

export interface OshellApi {
	app: {
		info(): Promise<AppInfo>
		runtimes(): Promise<{ python: PythonRuntime; runtimes: PythonRuntime[] }>
		setPython(path: string): Promise<{ python: PythonRuntime; runtimes: PythonRuntime[] }>
		pickPython(): Promise<string | null>
	}
	pane: {
		open(paneId: string, cwd?: string): Promise<EngineInfo>
		close(paneId: string): Promise<void>
		run(paneId: string, runId: string, line: string): Promise<void>
		cancel(paneId: string, runId: string): Promise<void>
		complete(paneId: string, line: string, cursor: number): Promise<CompleteResult>
		history(paneId: string): Promise<string[]>
		settings(paneId: string): Promise<Setting[]>
		setSetting(paneId: string, name: string, value: string): Promise<Setting[]>
		deleteSetting(paneId: string, name: string): Promise<Setting[]>
		onEvent(listener: (event: PaneEvent) => void): () => void
	}
	fs: {
		list(dir: string, showHidden: boolean): Promise<DirEntry[]>
		setWatched(dirs: string[]): Promise<void>
		onChanged(listener: (dir: string) => void): () => void
		reveal(path: string): Promise<void>
		open(path: string): Promise<string>
		preview(path: string): Promise<Preview>
	}
}
