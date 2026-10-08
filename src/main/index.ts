import { app, BrowserWindow, dialog, ipcMain, protocol, screen, shell, session, type WebContents } from 'electron'
import { execFileSync } from 'node:child_process'
import { createReadStream, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join, sep } from 'node:path'
import type { AppInfo, PaneEvent, PythonRuntime } from '../shared/types'
import { EngineProcess } from './engine'
import { DirWatcher, listDir, mediaType, readPreview } from './fs'
import {
	describePython,
	engineProblem,
	isPythonExecutable,
	pythonSearchDirs,
	pythonVersion,
	readPythonChoice,
	resolveEngine,
	type EngineCommand,
	type PythonChoice
} from './paths'
import { captureWindowState, DEFAULT_WINDOW, readWindowState, visibleWindowState, writeWindowState } from './window-state'

let engineCommand: EngineCommand = { python: '', script: '' }
let selectedPython: string | null = null

function commandFor(python?: string): EngineCommand {
	const base = resolveEngine({
		packaged: app.isPackaged,
		resourcesPath: process.resourcesPath,
		appRoot: app.getAppPath(),
		platform: process.platform,
		env: process.env
	})
	return python ? { ...base, python } : base
}

function applyPythonChoice(): void {
	selectedPython = process.env.OSHELL_PYTHON ? null : readPythonChoice(app.getPath('userData'))
	engineCommand = commandFor(selectedPython ?? undefined)
}

function runtimeInfo(): { python: PythonRuntime; runtimes: PythonRuntime[] } {
	const current = describePython(engineCommand.python, selectedPython ? 'selected' : app.isPackaged ? 'bundled' : 'default')
	const python: PythonRuntime = current ?? {
		path: engineCommand.python,
		version: '',
		label: engineCommand.python,
		source: selectedPython ? 'selected' : 'default'
	}
	return { python, runtimes: discoverRuntimes(python) }
}

function discoverRuntimes(current: PythonRuntime): PythonRuntime[] {
	const found = new Map<string, PythonRuntime>()
	const add = (choice: PythonChoice | null): void => {
		if (!choice || found.has(choice.path)) return
		found.set(choice.path, choice)
	}
	add(current.version ? { ...current, source: selectedPython ? 'selected' : current.source } : null)
	if (app.isPackaged) add(describePython(commandFor().python, 'bundled'))
	else add(describePython(commandFor().python, 'default'))

	for (const dir of pythonSearchDirs(process.platform, shellPath())) {
		let names: string[] = []
		try {
			names = readdirSync(dir).filter((name) => isPythonExecutable(name, process.platform))
		} catch {
			continue
		}
		for (const name of names) add(describePython(join(dir, name), 'path'))
	}
	return [...found.values()].sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))
}

// `npm run dev` from a terminal has the user's PATH; a Dock launch does not.
function shellPath(): NodeJS.ProcessEnv {
	if (process.platform === 'win32' || process.env.OSHELL_SKIP_LOGIN_PATH === '1') return process.env
	try {
		const login = execFileSync(process.env.SHELL || '/bin/zsh', ['-lic', 'printf %s "$PATH"'], {
			encoding: 'utf8',
			timeout: 4000,
			stdio: ['ignore', 'pipe', 'ignore']
		})
		const path = [login, process.env.PATH].filter(Boolean).join(delimiter)
		return { ...process.env, PATH: path }
	} catch {
		return process.env
	}
}

const engines = new Map<string, EngineProcess>()
let window: BrowserWindow | null = null
let watcher: DirWatcher | null = null

function send(channel: string, payload: unknown): void {
	const contents: WebContents | undefined = window?.webContents
	if (contents && !contents.isDestroyed()) contents.send(channel, payload)
}

function str(value: unknown, name: string): string {
	if (typeof value !== 'string' || value.length === 0) throw new Error(`${name} must be a non-empty string`)
	return value
}

function engineFor(paneId: string): EngineProcess {
	const engine = engines.get(paneId)
	if (!engine) throw new Error(`unknown pane: ${paneId}`)
	return engine
}

// ipcMain.handle only passes a thrown Error's message to the renderer; plain objects become "[object Object]".
function readable(error: unknown): Error {
	if (error instanceof Error) return error
	if (error && typeof error === 'object' && 'message' in error) {
		const { message, hint } = error as { message: unknown; hint?: unknown }
		return new Error(hint ? `${String(message)} (${String(hint)})` : String(message))
	}
	return new Error(String(error))
}

function registerIpc(): void {
	ipcMain.handle('app:info', (): AppInfo => ({
		platform: process.platform,
		home: homedir(),
		sep,
		engineHint: engineProblem(engineCommand) ?? '',
		...runtimeInfo()
	}))

	ipcMain.handle('app:runtimes', () => runtimeInfo())

	ipcMain.handle('app:setPython', async (_event, pythonPath: unknown) => {
		const picked = typeof pythonPath === 'string' ? pythonPath : ''
		if (picked && !pythonVersion(picked)) throw new Error(`${picked || 'that file'} is not a working Python`)
		const dir = app.getPath('userData')
		mkdirSync(dir, { recursive: true })
		writeFileSync(join(dir, 'python.json'), JSON.stringify({ python: picked }, null, 2))
		applyPythonChoice()
		const problem = engineProblem(engineCommand)
		if (problem) throw new Error(problem)
		for (const engine of engines.values()) engine.dispose()
		engines.clear()
		return runtimeInfo()
	})

	ipcMain.handle('app:pickPython', async () => {
		const parent = BrowserWindow.getFocusedWindow() ?? undefined
		const result = await dialog.showOpenDialog(parent!, {
			title: 'Choose a Python executable',
			properties: ['openFile'],
			buttonLabel: 'Use this Python'
		})
		if (result.canceled || !result.filePaths[0]) return null
		return result.filePaths[0]
	})

	ipcMain.handle('pane:open', async (_event, paneId: unknown, cwd: unknown) => {
		const id = str(paneId, 'paneId')
		const problem = engineProblem(engineCommand)
		if (problem) throw new Error(problem)
		engines.get(id)?.dispose()
		const engine = new EngineProcess({
			command: engineCommand,
			cwd: typeof cwd === 'string' && cwd ? cwd : homedir(),
			env: process.env.OSHELL_ENV ? { OSHELL_ENV: process.env.OSHELL_ENV } : undefined
		})
		engines.set(id, engine)
		return engine.info().catch((error) => {
			throw readable(error)
		})
	})

	ipcMain.handle('pane:close', (_event, paneId: unknown) => {
		const id = str(paneId, 'paneId')
		engines.get(id)?.dispose()
		engines.delete(id)
	})

	ipcMain.handle('pane:run', (_event, paneId: unknown, runId: unknown, line: unknown) => {
		const pane = str(paneId, 'paneId')
		const run = str(runId, 'runId')
		const text = typeof line === 'string' ? line : ''
		const emit = (event: PaneEvent['event']): void => send('pane:event', { paneId: pane, runId: run, event })
		engineFor(pane)
			.run(run, text, emit)
			.then((result) => emit({ type: 'done', result }))
			.catch((error) => {
				emit({ type: 'error', error })
				emit({ type: 'done', result: { count: 0, ms: 0, cwd: engines.get(pane)?.cwd ?? '', failed: true, cancelled: false } })
			})
	})

	ipcMain.handle('pane:cancel', (_event, paneId: unknown, runId: unknown) => {
		engines.get(str(paneId, 'paneId'))?.cancel(str(runId, 'runId'))
	})

	ipcMain.handle('pane:complete', (_event, paneId: unknown, line: unknown, cursor: unknown) =>
		engineFor(str(paneId, 'paneId'))
			.complete(typeof line === 'string' ? line : '', typeof cursor === 'number' ? cursor : 0)
			.catch((error) => {
				throw readable(error)
			})
	)

	ipcMain.handle('pane:history', (_event, paneId: unknown) =>
		engineFor(str(paneId, 'paneId'))
			.history()
			.catch((error) => {
				throw readable(error)
			})
	)

	// Settings live in ~/.openshell. Every pane has its own copy, so a write
	// is applied to each live engine; the file write is the same either way.
	const reloadSettings = async (writer: (engine: EngineProcess) => Promise<unknown>): Promise<unknown> => {
		const live = [...engines.values()]
		if (live.length === 0) throw new Error('no engine is running')
		const [first, ...rest] = live
		const result = await writer(first)
		await Promise.all(rest.map((engine) => engine.settings().catch(() => undefined)))
		return result
	}

	ipcMain.handle('pane:settings', (_event, paneId: unknown) =>
		engineFor(str(paneId, 'paneId'))
			.settings()
			.catch((error) => {
				throw readable(error)
			})
	)

	ipcMain.handle('pane:settings:set', (_event, _paneId: unknown, name: unknown, value: unknown) =>
		reloadSettings((engine) => engine.setSetting(str(name, 'name'), typeof value === 'string' ? value : ''))
			.catch((error) => {
				throw readable(error)
			})
	)

	ipcMain.handle('pane:settings:delete', (_event, _paneId: unknown, name: unknown) =>
		reloadSettings((engine) => engine.deleteSetting(str(name, 'name')))
			.catch((error) => {
				throw readable(error)
			})
	)

	ipcMain.handle('fs:list', (_event, dir: unknown, showHidden: unknown) => listDir(str(dir, 'dir'), showHidden === true))
	ipcMain.handle('fs:setWatched', (_event, dirs: unknown) => {
		const list = Array.isArray(dirs) ? dirs.filter((item): item is string => typeof item === 'string') : []
		watcher?.setWatched(list)
	})
	ipcMain.handle('fs:reveal', (_event, path: unknown) => shell.showItemInFolder(str(path, 'path')))
	ipcMain.handle('fs:open', (_event, path: unknown) => shell.openPath(str(path, 'path')))
	ipcMain.handle('fs:preview', (_event, path: unknown) =>
		readPreview(str(path, 'path'), (file) => `oshell-file://local/${encodeURIComponent(file)}`)
	)
}

protocol.registerSchemesAsPrivileged([
	{
		scheme: 'oshell-file',
		privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true }
	}
])

function registerFileProtocol(): void {
	protocol.handle('oshell-file', (request) => {
		let path = ''
		try {
			path = decodeURIComponent(new URL(request.url).pathname.replace(/^\/+/, ''))
		} catch {
			return new Response('bad path', { status: 400 })
		}
		const type = mediaType(path)
		if (!type) return new Response('not previewable', { status: 403 })
		return fileResponse(path, type, request.headers.get('range'))
	})
}

function fileResponse(path: string, type: string, range: string | null): Response {
	let size = 0
	try {
		size = statSync(path).size
	} catch {
		return new Response('not found', { status: 404 })
	}
	const headers = { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': String(size) }
	const match = range?.match(/^bytes=(\d*)-(\d*)$/)
	if (!match) return new Response(streamBody(path), { headers })
	const start = match[1] ? Number(match[1]) : 0
	const end = match[2] ? Number(match[2]) : size - 1
	if (start > end || end >= size) return new Response('bad range', { status: 416, headers: { 'content-range': `bytes */${size}` } })
	return new Response(streamBody(path, start, end), {
		status: 206,
		headers: {
			...headers,
			'content-length': String(end - start + 1),
			'content-range': `bytes ${start}-${end}/${size}`
		}
	})
}

function streamBody(path: string, start?: number, end?: number): ReadableStream<Uint8Array> {
	const file = createReadStream(path, start === undefined ? undefined : { start, end })
	return new ReadableStream({
		start(controller) {
			file.on('data', (chunk: Buffer | string) => controller.enqueue(typeof chunk === 'string' ? Buffer.from(chunk) : chunk))
			file.on('end', () => controller.close())
			file.on('error', (error) => controller.error(error))
		},
		cancel() {
			file.destroy()
		}
	})
}

function hardenSession(): void {
	if (!app.isPackaged) return
	session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
		callback({
			responseHeaders: {
				...details.responseHeaders,
				'Content-Security-Policy': [
					"default-src 'self'; img-src 'self' data: oshell-file:; media-src 'self' oshell-file:; frame-src 'self' oshell-file:; style-src 'self' 'unsafe-inline'; script-src 'self'"
				]
			}
		})
	})
}

function createWindow(): void {
	const saved = visibleWindowState(readWindowState(app.getPath('userData')), screen)
	window = new BrowserWindow({
		...(saved ?? DEFAULT_WINDOW),
		minWidth: 720,
		minHeight: 480,
		show: false,
		title: 'Open Shell Terminal',
		titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
		backgroundColor: '#14161a',
		webPreferences: {
			preload: join(__dirname, '../preload/index.js'),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true
		}
	})
	if (saved?.maximized) window.maximize()
	const remember = (): void => {
		if (!window) return
		try {
			writeWindowState(app.getPath('userData'), captureWindowState(window))
		} catch {
			// A failed write must not take the window down; the next move retries.
		}
	}
	window.on('resize', remember)
	window.on('move', remember)
	window.on('maximize', remember)
	window.on('unmaximize', remember)
	window.once('ready-to-show', () => window?.show())
	window.on('closed', () => {
		window = null
	})
	window.webContents.on('will-navigate', (event) => event.preventDefault())
	window.webContents.setWindowOpenHandler(({ url }) => {
		if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
		return { action: 'deny' }
	})

	watcher = new DirWatcher((dir) => send('fs:changed', dir))

	if (process.env.ELECTRON_RENDERER_URL) {
		void window.loadURL(process.env.ELECTRON_RENDERER_URL)
	} else {
		void window.loadFile(join(__dirname, '../renderer/index.html'))
	}
}

app.whenReady().then(() => {
	applyPythonChoice()
	hardenSession()
	registerFileProtocol()
	registerIpc()
	createWindow()
	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow()
	})
})

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
	watcher?.dispose()
	for (const engine of engines.values()) engine.dispose()
	engines.clear()
})
