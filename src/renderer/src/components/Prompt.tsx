import { useEffect, useRef, useState } from 'react'
import type { CompleteResult } from '../../../shared/types'
import { useStore } from '../store'

interface Popup {
	start: number
	end: number
	items: string[]
	index: number
}

function commonPrefix(items: string[]): string {
	let prefix = items[0] ?? ''
	for (const item of items) while (!item.startsWith(prefix)) prefix = prefix.slice(0, -1)
	return prefix
}

export function Prompt({ paneId }: { paneId: string }): React.JSX.Element {
	const pane = useStore((s) => s.panes[paneId])
	const insert = useStore((s) => s.promptInsert)
	const focused = useStore((s) => s.tabs.some((tab) => tab.activePaneId === paneId && tab.id === s.activeTabId))
	const run = useStore((s) => s.run)
	const [value, setValue] = useState('')
	const [popup, setPopup] = useState<Popup | null>(null)
	const input = useRef<HTMLInputElement>(null)
	const root = useRef<HTMLDivElement>(null)
	const popupBox = useRef<HTMLDivElement>(null)
	const [below, setBelow] = useState(false)
	const cursor = useRef(-1)
	const draft = useRef('')

	// The prompt can sit near the top of the output, so open the list downward then.
	useEffect(() => {
		if (!popup || !root.current) return
		const area = root.current.closest('.blocks')
		const room = root.current.getBoundingClientRect().top - (area?.getBoundingClientRect().top ?? 0)
		setBelow(room < 220)
	}, [popup?.items])

	useEffect(() => {
		if (popup && below) popupBox.current?.scrollIntoView({ block: 'nearest' })
	}, [popup?.items, below])

	useEffect(() => {
		if (focused && pane?.ready) input.current?.focus()
	}, [focused, pane?.ready])

	// Paths sent from the explorer's context menu.
	useEffect(() => {
		if (!insert || insert.paneId !== paneId) return
		const el = input.current
		const at = el?.selectionStart ?? value.length
		const text = `${value.slice(0, at)}${insert.text}${value.slice(at)}`
		setValue(text)
		el?.focus()
		requestAnimationFrame(() => el?.setSelectionRange(at + insert.text.length, at + insert.text.length))
		// Only react to a new insert request.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [insert?.nonce])

	if (!pane) return <div className="prompt" />

	const apply = (start: number, end: number, text: string): void => {
		setValue((current) => current.slice(0, start) + text + current.slice(end))
		const caret = start + text.length
		requestAnimationFrame(() => input.current?.setSelectionRange(caret, caret))
	}

	const complete = async (): Promise<void> => {
		if (popup) {
			const index = (popup.index + 1) % popup.items.length
			const item = popup.items[index]
			apply(popup.start, popup.end, item)
			setPopup({ ...popup, index, end: popup.start + item.length })
			return
		}
		let result: CompleteResult
		try {
			result = await window.oshell.pane.complete(paneId, value, input.current?.selectionStart ?? value.length)
		} catch {
			return
		}
		const { items } = result
		if (items.length === 0) return
		const typed = value.slice(result.start, result.end)
		if (items.length === 1) {
			apply(result.start, result.end, items[0] + (items[0].endsWith('/') || items[0].endsWith('\\') ? '' : ' '))
			return
		}
		const prefix = commonPrefix(items)
		let end = result.end
		if (prefix.length > typed.length) {
			apply(result.start, result.end, prefix)
			end = result.start + prefix.length
		}
		setPopup({ start: result.start, end, items, index: -1 })
	}

	const step = (direction: number): void => {
		const history = pane.history
		if (history.length === 0) return
		if (cursor.current === -1) {
			draft.current = value
			cursor.current = history.length
		}
		cursor.current = Math.max(0, Math.min(history.length, cursor.current + direction))
		setValue(cursor.current === history.length ? draft.current : history[cursor.current])
		if (cursor.current === history.length) cursor.current = -1
	}

	const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
		if (event.key === 'Tab') {
			event.preventDefault()
			void complete()
		} else if (event.key === 'Enter') {
			setPopup(null)
			cursor.current = -1
			run(paneId, value)
			setValue('')
		} else if (event.key === 'Escape') {
			setPopup(null)
		} else if (event.key === 'ArrowUp') {
			event.preventDefault()
			step(-1)
		} else if (event.key === 'ArrowDown') {
			event.preventDefault()
			step(1)
		} else if (event.ctrlKey && event.key.toLowerCase() === 'c' && input.current?.selectionStart === input.current?.selectionEnd) {
			for (const block of pane.blocks) if (block.status === 'running') useStore.getState().cancel(paneId, block.id)
		}
	}

	const label = pane.cwd.length > 40 ? '\u2026' + pane.cwd.slice(-39) : pane.cwd

	return (
		<div className="prompt" ref={root}>
			{popup && (
				<div className={below ? 'popup below' : 'popup'} ref={popupBox}>
					{popup.items.map((item, index) => (
						<div
							key={item}
							className={index === popup.index ? 'popup-item selected' : 'popup-item'}
							onMouseDown={(event) => {
								event.preventDefault()
								apply(popup.start, popup.end, item)
								setPopup({ ...popup, index, end: popup.start + item.length })
							}}
						>
							{item}
						</div>
					))}
				</div>
			)}
			<span className="prompt-cwd" title={pane.cwd}>
				{label}&gt;
			</span>
			<input
				ref={input}
				className="prompt-input"
				value={value}
				disabled={!pane.ready}
				spellCheck={false}
				autoComplete="off"
				autoCapitalize="off"
				placeholder={pane.ready ? 'ls | where .size > 10kb | sort .size --desc | take 5' : 'starting engine\u2026'}
				onChange={(event) => {
					setValue(event.target.value)
					setPopup(null)
					cursor.current = -1
				}}
				onKeyDown={onKeyDown}
				onBlur={() => setPopup(null)}
			/>
		</div>
	)
}
