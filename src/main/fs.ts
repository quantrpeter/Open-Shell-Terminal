import { watch, type FSWatcher } from 'node:fs'
import { open, readdir, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import type { DirEntry, Preview } from '../shared/types'

export async function listDir(dir: string, showHidden: boolean): Promise<DirEntry[]> {
	const entries = await readdir(dir, { withFileTypes: true })
	const result: DirEntry[] = []
	for (const entry of entries) {
		const hidden = entry.name.startsWith('.')
		if (hidden && !showHidden) continue
		const path = join(dir, entry.name)
		let isDir = entry.isDirectory()
		if (!isDir && entry.isSymbolicLink()) {
			try {
				isDir = (await stat(path)).isDirectory()
			} catch {
				// broken link: shown as a file
			}
		}
		result.push({ name: entry.name, path, isDir, hidden })
	}
	result.sort((a, b) => {
		if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
		return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })
	})
	return result
}

// Watches a set of directories (non-recursive) and reports changes, debounced.
export class DirWatcher {
	private watchers = new Map<string, FSWatcher>()
	private timers = new Map<string, NodeJS.Timeout>()

	constructor(private onChange: (dir: string) => void) {}

	setWatched(dirs: string[]): void {
		const wanted = new Set(dirs)
		for (const [dir, watcher] of this.watchers) {
			if (!wanted.has(dir)) {
				watcher.close()
				this.watchers.delete(dir)
			}
		}
		for (const dir of wanted) {
			if (this.watchers.has(dir)) continue
			try {
				const watcher = watch(dir, () => this.schedule(dir))
				watcher.on('error', () => {
					watcher.close()
					this.watchers.delete(dir)
				})
				this.watchers.set(dir, watcher)
			} catch {
				// unreadable or gone; the tree shows the error on its next load
			}
		}
	}

	private schedule(dir: string): void {
		const existing = this.timers.get(dir)
		if (existing) clearTimeout(existing)
		this.timers.set(
			dir,
			setTimeout(() => {
				this.timers.delete(dir)
				this.onChange(dir)
			}, 150)
		)
	}

	dispose(): void {
		for (const watcher of this.watchers.values()) watcher.close()
		for (const timer of this.timers.values()) clearTimeout(timer)
		this.watchers.clear()
		this.timers.clear()
	}
}

const IMAGE_TYPES: Record<string, string> = {
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.bmp': 'image/bmp',
	'.svg': 'image/svg+xml'
}
const MAX_TEXT = 256 * 1024
const MAX_IMAGE = 8 * 1024 * 1024

export async function readPreview(path: string): Promise<Preview> {
	const name = path.split(/[\\/]/).pop() || path
	try {
		const info = await stat(path)
		if (info.isDirectory()) return { kind: 'dir', name }
		const ext = extname(path).toLowerCase()
		const imageType = IMAGE_TYPES[ext]
		const handle = await open(path, 'r')
		try {
			if (imageType) {
				if (info.size > MAX_IMAGE) return { kind: 'too-large', name, size: info.size }
				const buffer = Buffer.alloc(info.size)
				await handle.read(buffer, 0, info.size, 0)
				return { kind: 'image', name, size: info.size, dataUrl: `data:${imageType};base64,${buffer.toString('base64')}` }
			}
			const length = Math.min(info.size, MAX_TEXT)
			const buffer = Buffer.alloc(length)
			await handle.read(buffer, 0, length, 0)
			if (buffer.includes(0)) return { kind: 'binary', name, size: info.size }
			return {
				kind: 'text',
				name,
				size: info.size,
				text: buffer.toString('utf8'),
				truncated: info.size > MAX_TEXT,
				ext
			}
		} finally {
			await handle.close()
		}
	} catch (err) {
		return { kind: 'error', name, message: err instanceof Error ? err.message : String(err) }
	}
}
