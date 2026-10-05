import { useMemo, useState } from 'react'
import { classify, formatDuration, toCsv } from '../lib/format'
import { shellQuote } from '../../../shared/quote'
import { useStore, type Block } from '../store'
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
	const view = useMemo(() => classify(block.records), [block.records, block.version])

	const body = (): React.JSX.Element | null => {
		if (raw && block.records.length > 0) {
			const text = JSON.stringify(block.records, null, 2)
			return <pre className="raw">{text.length > MAX_JSON_CHARS ? text.slice(0, MAX_JSON_CHARS) + '\n\u2026 truncated' : text}</pre>
		}
		switch (view.kind) {
			case 'table':
				return <RecordTable rows={view.rows} version={block.version} onCd={(path) => run(paneId, `cd ${shellQuote(path, windows)}`)} />
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

	return (
		<div className={`block ${block.status}`}>
			<div className="block-head">
				<div className="block-cmd" title={block.line}>
					<span className="muted">{block.cwd}&gt; </span>
					{block.line}
				</div>
				<span className={`status ${block.status}`}>{statusText}</span>
				{block.status === 'running' ? (
					<button className="btn" onClick={() => cancel(paneId, block.id)}>
						Cancel
					</button>
				) : (
					<button className="btn" onClick={() => run(paneId, block.line)}>
						Re-run
					</button>
				)}
				{view.kind !== 'empty' && (
					<button className="btn" onClick={() => setRaw((value) => !value)}>
						{raw ? 'View' : 'JSON'}
					</button>
				)}
				{view.kind !== 'empty' && <CopyButton label="Copy" text={() => JSON.stringify(block.records, null, 2)} />}
				{view.kind === 'table' && <CopyButton label="CSV" text={() => toCsv(view.rows)} />}
				<button className="btn" title="Remove block" onClick={() => removeBlock(paneId, block.id)}>
					&times;
				</button>
			</div>
			{block.errors.map((error, index) => (
				<div key={index} className="error">
					<span>
						error[{error.code}] {error.message}
					</span>
					{error.hint && <div className="muted">hint: {error.hint}</div>}
				</div>
			))}
			{body()}
			{view.kind === 'empty' && block.status === 'done' && block.errors.length === 0 && (
				<div className="empty muted">(no records)</div>
			)}
		</div>
	)
}
