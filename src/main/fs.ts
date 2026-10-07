import { watch, type FSWatcher } from 'node:fs'
import { open, readdir, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { inflateRawSync } from 'node:zlib'
import type { DirEntry, Preview, SheetPreview } from '../shared/types'

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
const VIDEO_TYPES: Record<string, string> = {
	'.mp4': 'video/mp4',
	'.m4v': 'video/mp4',
	'.webm': 'video/webm',
	'.mov': 'video/quicktime'
}
const SHEET_TYPES = new Set(['.xlsx', '.xlsm'])
const DOC_TYPES = new Set(['.docx'])
const MAX_TEXT = 256 * 1024
const MAX_IMAGE = 8 * 1024 * 1024
const MAX_SHEET = 20 * 1024 * 1024
const SHEET_ROWS = 200
const SHEET_COLS = 26

export function mediaType(path: string): string | null {
	const ext = extname(path).toLowerCase()
	if (ext === '.pdf') return 'application/pdf'
	return VIDEO_TYPES[ext] ?? null
}

export async function readPreview(path: string, mediaUrl?: (path: string) => string, bytes?: Buffer): Promise<Preview> {
	const name = path.split(/[\\/]/).pop() || path
	try {
		const info = bytes ? { isDirectory: () => false, size: bytes.length } : await stat(path)
		if (info.isDirectory()) return { kind: 'dir', name }
		const ext = extname(path).toLowerCase()
		const video = VIDEO_TYPES[ext]
		if ((video || ext === '.pdf') && mediaUrl) {
			return { kind: 'media', name, size: info.size, url: mediaUrl(path), media: video ? 'video' : 'pdf' }
		}
		if (SHEET_TYPES.has(ext)) {
			if (info.size > MAX_SHEET) return { kind: 'too-large', name, size: info.size }
			const buffer = bytes ?? (await readAll(path, info.size))
			return { kind: 'sheet', name, size: info.size, sheets: readWorkbook(buffer) }
		}
		if (DOC_TYPES.has(ext)) {
			if (info.size > MAX_SHEET) return { kind: 'too-large', name, size: info.size }
			const buffer = bytes ?? (await readAll(path, info.size))
			const text = readDocx(buffer)
			return { kind: 'text', name, size: info.size, text, truncated: text.length >= MAX_TEXT, ext }
		}
		const imageType = IMAGE_TYPES[ext]
		if (imageType) {
			if (info.size > MAX_IMAGE) return { kind: 'too-large', name, size: info.size }
			const buffer = bytes ?? (await readAll(path, info.size))
			return { kind: 'image', name, size: info.size, dataUrl: `data:${imageType};base64,${buffer.toString('base64')}` }
		}
		const length = Math.min(info.size, MAX_TEXT)
		const buffer = bytes ? bytes.subarray(0, length) : await readAll(path, length)
		if (buffer.includes(0)) return { kind: 'binary', name, size: info.size }
		return {
			kind: 'text',
			name,
			size: info.size,
			text: buffer.toString('utf8'),
			truncated: info.size > MAX_TEXT,
			ext
		}
	} catch (err) {
		return { kind: 'error', name, message: err instanceof Error ? err.message : String(err) }
	}
}

async function readAll(path: string, size: number): Promise<Buffer> {
	const handle = await open(path, 'r')
	try {
		const buffer = Buffer.alloc(size)
		await handle.read(buffer, 0, size, 0)
		return buffer
	} finally {
		await handle.close()
	}
}

// Minimal xlsx reader: shared strings, inline strings, and numeric cells.
// Enough for a preview; formulas show their cached value.
function readWorkbook(buffer: Buffer): SheetPreview[] {
	const files = unzip(buffer)
	const shared = sharedStrings(files.get('xl/sharedStrings.xml') ?? '')
	const workbook = files.get('xl/workbook.xml') ?? ''
	const rels = files.get('xl/_rels/workbook.xml.rels') ?? ''
	const sheets: SheetPreview[] = []
	for (const match of workbook.matchAll(/<sheet\b[^>]*\bname="([^"]*)"[^>]*\br:id="([^"]+)"/g)) {
		const target = relTarget(rels, match[2])
		if (!target) continue
		const xml = files.get(target.startsWith('/') ? target.slice(1) : `xl/${target}`)
		if (xml) sheets.push(readSheet(decodeXml(match[1]), xml, shared))
	}
	if (sheets.length === 0) {
		for (const [path, xml] of files) {
			if (/^xl\/worksheets\/sheet\d+\.xml$/.test(path)) sheets.push(readSheet(path, xml, shared))
		}
	}
	return sheets
}

function relTarget(rels: string, id: string): string | null {
	const match = rels.match(new RegExp(`Id="${id}"[^>]*Target="([^"]+)"`))
	return match ? match[1] : null
}

function sharedStrings(xml: string): string[] {
	const strings: string[] = []
	for (const item of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
		strings.push(
			[...item[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((part) => decodeXml(part[1])).join('')
		)
	}
	return strings
}

function readSheet(name: string, xml: string, shared: string[]): SheetPreview {
	const rows: string[][] = []
	let truncated = false
	for (const row of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
		const index = Number(/r="(\d+)"/.exec(row[1])?.[1] ?? rows.length + 1) - 1
		if (index >= SHEET_ROWS) {
			truncated = true
			break
		}
		const cells: string[] = []
		for (const cell of row[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
			const ref = /r="([A-Z]+)/.exec(cell[1])
			const col = ref ? colIndex(ref[1]) : cells.length
			if (col >= SHEET_COLS) {
				truncated = true
				continue
			}
			cells[col] = cellText(cell[1], cell[2] ?? '', shared)
		}
		rows[index] = cells
	}
	while (rows.length > 0 && rows[rows.length - 1] === undefined) rows.pop()
	for (let i = 0; i < rows.length; i++) rows[i] ??= []
	return { name, rows, truncated }
}

function cellText(attrs: string, body: string, shared: string[]): string {
	const type = /t="([^"]+)"/.exec(attrs)?.[1]
	if (type === 'inlineStr') return [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((part) => decodeXml(part[1])).join('')
	const value = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? ''
	if (type === 's') return shared[Number(value)] ?? ''
	if (type === 'b') return value === '1' ? 'TRUE' : 'FALSE'
	return decodeXml(value)
}

// Paragraphs and table cells from word/document.xml. Formatting is dropped.
function readDocx(buffer: Buffer): string {
	const xml = unzip(buffer).get('word/document.xml') ?? ''
	const paragraphs: string[] = []
	let size = 0
	for (const block of xml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)) {
		const parts = [...block[1].matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map((part) => decodeXml(part[1]))
		if (parts.length === 0) continue
		const line = parts.join('')
		if (size + line.length > MAX_TEXT) {
			paragraphs.push(line.slice(0, MAX_TEXT - size))
			break
		}
		paragraphs.push(line)
		size += line.length + 1
	}
	return paragraphs.join('\n')
}

function colIndex(letters: string): number {
	let index = 0
	for (const char of letters) index = index * 26 + (char.charCodeAt(0) - 64)
	return index - 1
}

function decodeXml(text: string): string {
	return text
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
		.replace(/&amp;/g, '&')
}

interface ZipEntry {
	name: string
	method: number
	compressed: number
	offset: number
}

function unzip(buffer: Buffer): Map<string, string> {
	const entries = new Map<string, string>()
	let offset = 0
	while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
		const entry: ZipEntry = {
			name: '',
			method: buffer.readUInt16LE(offset + 8),
			compressed: buffer.readUInt32LE(offset + 18),
			offset: 0
		}
		const nameLength = buffer.readUInt16LE(offset + 26)
		const extraLength = buffer.readUInt16LE(offset + 28)
		entry.name = buffer.toString('utf8', offset + 30, offset + 30 + nameLength)
		entry.offset = offset + 30 + nameLength + extraLength
		if (entry.offset + entry.compressed > buffer.length) break
		const compressed = buffer.subarray(entry.offset, entry.offset + entry.compressed)
		if (entry.name.endsWith('.xml') || entry.name.endsWith('.rels')) {
			const data = entry.method === 0 ? compressed : entry.method === 8 ? inflateRawSync(compressed) : null
			if (data) entries.set(entry.name, data.toString('utf8'))
		}
		offset = entry.offset + entry.compressed
	}
	return entries
}
