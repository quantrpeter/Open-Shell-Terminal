// Rendering helpers for records. Pure functions, unit-tested.

export type Row = Record<string, unknown>

export const isRow = (value: unknown): value is Row =>
	value !== null && typeof value === 'object' && !Array.isArray(value)

const pad = (n: number): string => String(n).padStart(2, '0')

export function humanSize(n: number): string {
	let value = n
	for (const unit of ['B', 'K', 'M', 'G', 'T', 'P']) {
		if (Math.abs(value) < 1024 || unit === 'P') {
			return unit === 'B' ? `${Math.trunc(value)}B` : `${value.toFixed(1)}${unit}`
		}
		value /= 1024
	}
	return String(n)
}

export function formatDate(seconds: number): string {
	const d = new Date(seconds * 1000)
	return (
		`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
		`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
	)
}

export function formatCell(column: string, value: unknown): string {
	if (value === null || value === undefined) return ''
	if (typeof value === 'number') {
		if (column === 'size') return humanSize(value)
		if ((column === 'modified' || column === 'timestamp') && Number.isFinite(value)) return formatDate(value)
	}
	if (typeof value === 'boolean') return value ? 'true' : 'false'
	if (typeof value === 'object') return JSON.stringify(value)
	return String(value)
}

// Same total order as the shell: null < numbers < strings.
export function compareValues(a: unknown, b: unknown): number {
	const key = (value: unknown): [number, number, string] => {
		if (value === null || value === undefined) return [0, 0, '']
		if (typeof value === 'boolean') return [1, value ? 1 : 0, '']
		if (typeof value === 'number') return [1, value, '']
		return [2, 0, String(value)]
	}
	const [ta, na, sa] = key(a)
	const [tb, nb, sb] = key(b)
	if (ta !== tb) return ta - tb
	if (na !== nb) return na - nb
	return sa < sb ? -1 : sa > sb ? 1 : 0
}

export function columnsOf(rows: Row[]): string[] {
	const seen = new Set<string>()
	const columns: string[] = []
	for (const row of rows) {
		for (const key of Object.keys(row)) {
			if (key !== '$t' && !seen.has(key)) {
				seen.add(key)
				columns.push(key)
			}
		}
	}
	return columns
}

export function toCsv(rows: Row[]): string {
	const columns = columnsOf(rows)
	const quote = (value: unknown): string => {
		const text =
			value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)
		return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
	}
	return [columns.map(quote).join(','), ...rows.map((row) => columns.map((c) => quote(row[c])).join(','))].join('\n')
}

export type ViewKind = 'table' | 'log' | 'text' | 'json' | 'empty'

export interface Classified {
	kind: ViewKind
	rows: Row[]
	text: string[]
}

// Pick how a block's records are shown: text records, command output lines,
// a table of uniform objects, or raw JSON for anything else.
export function classify(records: unknown[]): Classified {
	if (records.length === 0) return { kind: 'empty', rows: [], text: [] }
	if (records.every((r) => isRow(r) && r.$t === 'text')) {
		return { kind: 'text', rows: [], text: records.map((r) => String((r as Row).text ?? '')) }
	}
	if (records.every((r) => isRow(r) && typeof r.line === 'string' && (r.stream === 'stdout' || r.stream === 'stderr'))) {
		return { kind: 'log', rows: records as Row[], text: [] }
	}
	if (records.every((r) => isRow(r) && r.$t === undefined)) return { kind: 'table', rows: records as Row[], text: [] }
	return { kind: 'json', rows: [], text: [] }
}

export function formatDuration(ms: number): string {
	return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)}s`
}
