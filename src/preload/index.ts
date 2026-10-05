import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { OshellApi, PaneEvent } from '../shared/types'

const api: OshellApi = {
	app: { info: () => ipcRenderer.invoke('app:info') },
	pane: {
		open: (paneId, cwd) => ipcRenderer.invoke('pane:open', paneId, cwd),
		close: (paneId) => ipcRenderer.invoke('pane:close', paneId),
		run: (paneId, runId, line) => ipcRenderer.invoke('pane:run', paneId, runId, line),
		cancel: (paneId, runId) => ipcRenderer.invoke('pane:cancel', paneId, runId),
		complete: (paneId, line, cursor) => ipcRenderer.invoke('pane:complete', paneId, line, cursor),
		history: (paneId) => ipcRenderer.invoke('pane:history', paneId),
		onEvent: (listener) => {
			const handler = (_event: IpcRendererEvent, payload: PaneEvent): void => listener(payload)
			ipcRenderer.on('pane:event', handler)
			return () => ipcRenderer.removeListener('pane:event', handler)
		}
	},
	fs: {
		list: (dir, showHidden) => ipcRenderer.invoke('fs:list', dir, showHidden),
		setWatched: (dirs) => ipcRenderer.invoke('fs:setWatched', dirs),
		onChanged: (listener) => {
			const handler = (_event: IpcRendererEvent, dir: string): void => listener(dir)
			ipcRenderer.on('fs:changed', handler)
			return () => ipcRenderer.removeListener('fs:changed', handler)
		},
		reveal: (path) => ipcRenderer.invoke('fs:reveal', path),
		open: (path) => ipcRenderer.invoke('fs:open', path),
		preview: (path) => ipcRenderer.invoke('fs:preview', path)
	}
}

contextBridge.exposeInMainWorld('oshell', api)
