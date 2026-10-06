import { useEffect, useMemo, useRef, useState } from 'react'
import type { Setting } from '../../../shared/types'
import { useStore } from '../store'

function textOf(value: unknown): string {
	if (typeof value === 'string') return value
	if (value === null || value === undefined) return ''
	return JSON.stringify(value)
}

function paneId(): string | null {
	const state = useStore.getState()
	return state.tabs.find((tab) => tab.id === state.activeTabId)?.activePaneId ?? null
}

function messageOf(error: unknown): string {
	const raw = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error)
	return raw.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

export function SettingsDialog(): React.JSX.Element {
	const close = (): void => useStore.getState().toggle('settingsOpen')
	const [rows, setRows] = useState<Setting[]>([])
	const [query, setQuery] = useState('')
	const [error, setError] = useState('')
	const [busy, setBusy] = useState(false)
	const [draftName, setDraftName] = useState('')
	const [draftValue, setDraftValue] = useState('')
	const [editing, setEditing] = useState<string | null>(null)
	const searchRef = useRef<HTMLInputElement>(null)

	const load = (): void => {
		const id = paneId()
		if (!id) return
		void window.oshell.pane
			.settings(id)
			.then((settings) => {
				setRows(settings)
				setError('')
			})
			.catch((err: unknown) => setError(messageOf(err)))
	}

	useEffect(() => {
		load()
		searchRef.current?.focus()
	}, [])

	useEffect(() => {
		const onKey = (event: KeyboardEvent): void => {
			if (event.key === 'Escape') {
				event.preventDefault()
				event.stopPropagation()
				close()
			}
		}
		window.addEventListener('keydown', onKey, true)
		return () => window.removeEventListener('keydown', onKey, true)
	}, [])

	const shown = useMemo(() => {
		const needle = query.trim().toLowerCase()
		if (!needle) return rows
		return rows.filter((row) => row.name.toLowerCase().includes(needle) || textOf(row.value).toLowerCase().includes(needle))
	}, [rows, query])

	const save = (name: string, value: string, previous?: string): void => {
		const id = paneId()
		const trimmed = name.trim()
		if (!id || busy) return
		if (!trimmed || trimmed.startsWith('-')) {
			setError('use a name such as ai or ai_key')
			return
		}
		setBusy(true)
		const write = async (): Promise<Setting[]> => {
			if (previous && previous !== trimmed) await window.oshell.pane.deleteSetting(id, previous)
			return window.oshell.pane.setSetting(id, trimmed, value)
		}
		void write()
			.then((settings) => {
				setRows(settings)
				setError('')
				setEditing(null)
				setDraftName('')
				setDraftValue('')
			})
			.catch((err: unknown) => setError(messageOf(err)))
			.finally(() => setBusy(false))
	}

	const remove = (name: string): void => {
		const id = paneId()
		if (!id || busy) return
		setBusy(true)
		void window.oshell.pane
			.deleteSetting(id, name)
			.then((settings) => {
				setRows(settings)
				setError('')
				if (editing === name) setEditing(null)
			})
			.catch((err: unknown) => setError(messageOf(err)))
			.finally(() => setBusy(false))
	}

	return (
		<div className="settings-overlay" onMouseDown={close}>
			<div
				className="settings-dialog"
				role="dialog"
				aria-label="Environment variables"
				onMouseDown={(event) => event.stopPropagation()}
			>
				<div className="settings-head">
					<span>Environment</span>
					<button type="button" className="icon-btn" onClick={close} title="Close">
						×
					</button>
				</div>
				<input
					ref={searchRef}
					className="settings-search"
					placeholder="Search name or value"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
				/>
				<div className="settings-list">
					{shown.length === 0 && <div className="muted pad">No settings.</div>}
					{shown.map((row) =>
						editing === row.name ? (
							<form
								key={row.name}
								className="settings-edit"
								onSubmit={(event) => {
									event.preventDefault()
									save(draftName, draftValue, row.name)
								}}
							>
								<input value={draftName} onChange={(event) => setDraftName(event.target.value)} aria-label="Edit name" />
								<input value={draftValue} onChange={(event) => setDraftValue(event.target.value)} aria-label="Edit value" />
								<button type="submit" disabled={busy}>
									Save
								</button>
								<button type="button" onClick={() => setEditing(null)}>
									Cancel
								</button>
							</form>
						) : (
							<div key={row.name} className="settings-row">
								<span className="settings-name">{row.name}</span>
								<span className="settings-value" title={textOf(row.value)}>
									{textOf(row.value)}
								</span>
								<button
									type="button"
									onClick={() => {
										setEditing(row.name)
										setDraftName(row.name)
										setDraftValue(textOf(row.value))
									}}
								>
									Edit
								</button>
								<button type="button" onClick={() => remove(row.name)} disabled={busy}>
									Delete
								</button>
							</div>
						)
					)}
				</div>
				<form
					className="settings-add"
					onSubmit={(event) => {
						event.preventDefault()
						save(draftName, draftValue)
					}}
				>
					<input
						placeholder="name"
						aria-label="New name"
						value={editing ? '' : draftName}
						disabled={editing !== null}
						onChange={(event) => setDraftName(event.target.value)}
					/>
					<input
						placeholder="value"
						aria-label="New value"
						value={editing ? '' : draftValue}
						disabled={editing !== null}
						onChange={(event) => setDraftValue(event.target.value)}
					/>
					<button type="submit" disabled={busy || editing !== null}>
						Add
					</button>
				</form>
				{error && <div className="settings-error">{error}</div>}
				<div className="settings-foot muted">Saved to ~/.openshell. Values are stored as text.</div>
			</div>
		</div>
	)
}
