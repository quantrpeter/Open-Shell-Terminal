import { useMemo, useState } from 'react'
import { classify, formatDuration, isQuietLine, toCsv } from '../lib/format'
import { shellQuote } from '../../../shared/quote'
import { useStore, type Block } from '../store'
import { Icon } from './Icon'
import { RecordTable } from './RecordTable'

const MAX_LOG_LINES = 5000
const MAX_JSON_CHARS = 200_000

function CopyButton({ label, text }: { label: string; text: () => string }): React.JSX.Element {
	const [state, setState] = useState(label)
	return (
		<button
			className="btn"
			onClick={() => {
				navigator.clipboard.writeText(text()).then(
					() => setState('Copied'),
					() => setState('Failed')
				)
				setTimeout(() => setState(label), 1000)
			}}
		>
			{state}
		</button>
	)
}

export function BlockView({ paneId, block }: { paneId: string; block: Block }): React.JSX.Element {
	const { cancel, removeBlock, run } = useStore.getState()
	const windows = useStore((s) => s.app?.platform === 'win32')
	const [raw, setRaw] = useState(false)
	const [filterOpen, setFilterOpen] = useState(false)
	const [filter, setFilter] = useState('')
	const view = useMemo(() => classify(block.records), [block.records, block.version])
	const quiet = isQuietLine(block.line)

	const body = (): React.JSX.Element | null => {
		if (quiet) return null
		if (raw && block.records.length > 0) {
			const text = JSON.stringify(block.records, null, 2)
			return <pre className="raw">{text.length > MAX_JSON_CHARS ? text.slice(0, MAX_JSON_CHARS) + '\n\u2026 truncated' : text}</pre>
		}
		switch (view.kind) {
			case 'table':
				return (
					<RecordTable
						rows={view.rows}
						version={block.version}
						filter={filter}
						onCd={(path) => run(paneId, `cd ${shellQuote(path, windows)}`)}
					/>
				)
			case 'log': {
				const rows = view.rows.length > MAX_LOG_LINES ? view.rows.slice(-MAX_LOG_LINES) : view.rows
				return (
					<pre className="log">
						{view.rows.length > rows.length && <div className="muted">{view.rows.length - rows.length} earlier lines hidden</div>}
						{rows.map((row, index) => (
							<div key={index} className={row.stream === 'stderr' ? 'log-line stderr' : 'log-line'}>
								{String(row.line)}
							</div>
						))}
					</pre>
				)
			}
			case 'text':
				return <pre className="raw">{view.text.join('\n')}</pre>
			case 'json': {
				const text = block.records.map((r) => JSON.stringify(r)).join('\n')
				return <pre className="raw">{text.length > MAX_JSON_CHARS ? text.slice(0, MAX_JSON_CHARS) + '\n\u2026 truncated' : text}</pre>
			}
			default:
				return null
		}
	}

	const statusText =
		block.status === 'running'
			? 'running'
			: `${block.status} \u00b7 ${block.summary?.count ?? 0} \u00b7 ${formatDuration(block.summary?.ms ?? 0)}`
	const hasData = !quiet && view.kind !== 'empty'

	return (
		<div className={`block ${block.status}${quiet ? ' quiet' : ''}`}>
			<div className="block-head">
				<div className="block-cmd" title={block.line}>
					<span className="muted">{block.cwd}&gt; </span>
					{block.line}
				</div>
				<span className={`status ${block.status}`}>{statusText}</span>
				{block.status === 'running' && (
					<button className="btn" onClick={() => cancel(paneId, block.id)}>
						Cancel
					</button>
				)}
				<div className="block-actions">
					{block.status !== 'running' && (
						<button className="btn" onClick={() => run(paneId, block.line)}>
							Re-run
						</button>
					)}
					{hasData && view.kind === 'table' && !raw && (
						<button className={filterOpen ? 'btn active' : 'btn'} onClick={() => setFilterOpen((open) => !open)}>
							Filter
						</button>
					)}
					{hasData && (
						<button className="btn" onClick={() => setRaw((value) => !value)}>
							{raw ? 'View' : 'JSON'}
						</button>
					)}
					{hasData && <CopyButton label="Copy" text={() => JSON.stringify(block.records, null, 2)} />}
					{hasData && view.kind === 'table' && <CopyButton label="CSV" text={() => toCsv(view.rows)} />}
					<button className="btn icon-btn" title="Remove block" onClick={() => removeBlock(paneId, block.id)}>
						<Icon name="close" />
					</button>
				</div>
			</div>
			{filterOpen && hasData && view.kind === 'table' && !raw && (
				<div className="filter-row">
					<input
						className="filter"
						autoFocus
						placeholder="Filter rows"
						value={filter}
						onChange={(event) => setFilter(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === 'Escape') {
								setFilter('')
								setFilterOpen(false)
							}
						}}
					/>
				</div>
			)}
			{block.errors.map((error, index) => (
				<div key={index} className="error">
					<span>
						error[{error.code}] {error.message}
					</span>
					{error.hint && <div className="muted">hint: {error.hint}</div>}
				</div>
			))}
			{body()}
			{!quiet && view.kind === 'empty' && block.status === 'done' && block.errors.length === 0 && (
				<div className="empty muted">(no records)</div>
			)}
		</div>
	)
}
