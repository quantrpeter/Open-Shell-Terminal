import { app, BrowserWindow, ipcMain, shell, session, type WebContents } from 'electron'
import { homedir } from 'node:os'
import { join, sep } from 'node:path'
import type { AppInfo, PaneEvent } from '../shared/types'
import { EngineProcess } from './engine'
import { DirWatcher, listDir, readPreview } from './fs'
import { engineProblem, resolveEngine } from './paths'

const engineCommand = resolveEngine({
	packaged: app.isPackaged,
	resourcesPath: process.resourcesPath,
	appRoot: app.getAppPath(),
	platform: process.platform,
	env: process.env
})

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

function registerIpc(): void {
	ipcMain.handle('app:info', (): AppInfo => ({
		platform: process.platform,
		home: homedir(),
		sep,
		engineHint: engineProblem(engineCommand) ?? ''
	}))

	ipcMain.handle('pane:open', async (_event, paneId: unknown, cwd: unknown) => {
		const id = str(paneId, 'paneId')
		engines.get(id)?.dispose()
		const engine = new EngineProcess({
			command: engineCommand,
			cwd: typeof cwd === 'string' && cwd ? cwd : homedir()
		})
		engines.set(id, engine)
		return engine.info()
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
		engineFor(str(paneId, 'paneId')).complete(typeof line === 'string' ? line : '', typeof cursor === 'number' ? cursor : 0)
	)

	ipcMain.handle('pane:history', (_event, paneId: unknown) => engineFor(str(paneId, 'paneId')).history())

	ipcMain.handle('fs:list', (_event, dir: unknown, showHidden: unknown) => listDir(str(dir, 'dir'), showHidden === true))
	ipcMain.handle('fs:setWatched', (_event, dirs: unknown) => {
		const list = Array.isArray(dirs) ? dirs.filter((item): item is string => typeof item === 'string') : []
		watcher?.setWatched(list)
	})
	ipcMain.handle('fs:reveal', (_event, path: unknown) => shell.showItemInFolder(str(path, 'path')))
	ipcMain.handle('fs:open', (_event, path: unknown) => shell.openPath(str(path, 'path')))
	ipcMain.handle('fs:preview', (_event, path: unknown) => readPreview(str(path, 'path')))
}

function hardenSession(): void {
	if (!app.isPackaged) return
	session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
		callback({
			responseHeaders: {
				...details.responseHeaders,
				'Content-Security-Policy': [
					"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'"
				]
			}
		})
	})
}

function createWindow(): void {
	window = new BrowserWindow({
		width: 1360,
		height: 860,
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
	hardenSession()
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
