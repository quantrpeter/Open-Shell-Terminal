import { useEffect, useState } from 'react'
import { useStore } from '../store'

function messageOf(error: unknown): string {
	const raw = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error)
	return raw.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

export function PythonDialog(): React.JSX.Element {
	const close = (): void => useStore.setState({ pythonOpen: false })
	const python = useStore((s) => s.python)
	const runtimes = useStore((s) => s.runtimes)
	const [error, setError] = useState('')
	const [busy, setBusy] = useState(false)

	useEffect(() => {
		void window.oshell.app.runtimes().then((next) => useStore.setState({ python: next.python, runtimes: next.runtimes }))
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

	const choose = (path: string): void => {
		if (busy || path === python?.path) return
		setBusy(true)
		setError('')
		void useStore
			.getState()
			.selectPython(path)
			.catch((err: unknown) => {
				setError(messageOf(err))
				setBusy(false)
			})
	}

	const browse = (): void => {
		if (busy) return
		void window.oshell.app.pickPython().then((path) => {
			if (path) choose(path)
		})
	}

	return (
		<div className="settings-overlay" onMouseDown={close}>
			<div
				className="settings-dialog"
				role="dialog"
				aria-label="Python runtime"
				onMouseDown={(event) => event.stopPropagation()}
			>
				<div className="settings-head">
					<span>Python runtime</span>
					<button className="status-btn" onClick={close}>
						Close
					</button>
				</div>
				<div className="settings-list">
					{runtimes.length === 0 && <div className="muted pad">No Python found.</div>}
					{runtimes.map((item) => (
						<button
							key={item.path}
							className={item.path === python?.path ? 'python-row active' : 'python-row'}
							disabled={busy}
							onClick={() => choose(item.path)}
							title={item.path}
						>
							<span>{item.label}</span>
							<span className="muted">{item.path === python?.path ? 'in use' : item.source}</span>
						</button>
					))}
				</div>
				<div className="settings-add">
					<button disabled={busy} onClick={() => choose('')}>
						Use default
					</button>
					<button disabled={busy} onClick={browse}>
						Browse…
					</button>
				</div>
				{error && <div className="settings-error">{error}</div>}
				<div className="settings-foot muted">Choosing a Python restarts every pane. The choice is kept for the next launch.</div>
			</div>
		</div>
	)
}
