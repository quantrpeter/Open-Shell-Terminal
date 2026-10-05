import { useDeferredValue, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { columnsOf, compareValues, formatCell, type Row } from '../lib/format'

const ROW_HEIGHT = 24
const CHAR_WIDTH = 7.6

interface Sort {
	column: string
	dir: 1 | -1
}

interface Props {
	rows: Row[]
	version: number
	onCd(path: string): void
}

// Virtualised table for streams of uniform records. Sorting and filtering run
// in the renderer over the rows received so far.
export function RecordTable({ rows, version, onCd }: Props): React.JSX.Element {
	const [sort, setSort] = useState<Sort | null>(null)
	const [filter, setFilter] = useState('')
	const scroller = useRef<HTMLDivElement>(null)
	const settled = useDeferredValue(version)

	const columns = useMemo(() => columnsOf(rows), [rows, settled])
	const numeric = useMemo(
		() =>
			new Set(
				columns.filter(
					(c) => c === 'size' || rows.every((row) => row[c] == null || typeof row[c] === 'number')
				)
			),
		[columns, rows, settled]
	)

	const visible = useMemo(() => {
		const needle = filter.trim().toLowerCase()
		let list = rows
		if (needle) {
			list = rows.filter((row) => columns.some((c) => formatCell(c, row[c]).toLowerCase().includes(needle)))
		}
		if (sort) {
			const { column, dir } = sort
			list = [...list].sort((a, b) => dir * compareValues(a[column], b[column]))
		}
		return list
	}, [rows, columns, filter, sort, settled])

	const widths = useMemo(() => {
		const sample = rows.slice(0, 300)
		return columns.map((c) => {
			let longest = c.length + 2
			for (const row of sample) longest = Math.max(longest, formatCell(c, row[c]).length)
			return Math.round(Math.min(Math.max(longest * CHAR_WIDTH + 24, 64), 520))
		})
	}, [columns, rows, settled])

	const virtualizer = useVirtualizer({
		count: visible.length,
		getScrollElement: () => scroller.current,
		estimateSize: () => ROW_HEIGHT,
		overscan: 20
	})

	const template = widths.map((w) => `${w}px`).join(' ')
	const totalWidth = widths.reduce((a, b) => a + b, 0)
	const height = Math.min(visible.length, 14) * ROW_HEIGHT + ROW_HEIGHT + 2

	const plural = (n: number): string => `${n} record${n === 1 ? '' : 's'}`
	const toggleSort = (column: string): void => {
		setSort((prev) => {
			if (!prev || prev.column !== column) return { column, dir: 1 }
			return prev.dir === 1 ? { column, dir: -1 } : null
		})
	}

	return (
		<div className="table-wrap">
			<div className="table-tools">
				<input
					className="filter"
					placeholder="Filter rows"
					value={filter}
					onChange={(event) => setFilter(event.target.value)}
				/>
				<span className="muted">
					{visible.length === rows.length ? plural(rows.length) : `${visible.length} of ${plural(rows.length)}`}
				</span>
			</div>
			<div className="table-scroll" ref={scroller} style={{ height }}>
				<div style={{ width: totalWidth, minWidth: '100%' }}>
					<div className="table-head" style={{ gridTemplateColumns: template }}>
						{columns.map((column, index) => (
							<div
								key={column}
								className={numeric.has(columns[index]) ? 'cell head num' : 'cell head'}
								onClick={() => toggleSort(column)}
							>
								{column}
								{sort?.column === column && <span className="arrow">{sort.dir === 1 ? ' \u25b2' : ' \u25bc'}</span>}
							</div>
						))}
					</div>
					<div className="table-body" style={{ height: virtualizer.getTotalSize() }}>
						{virtualizer.getVirtualItems().map((item) => {
							const row = visible[item.index]
							const dirPath = row.is_dir === true && typeof row.fullpath === 'string' ? row.fullpath : null
							return (
								<div
									key={item.index}
									className="table-row"
									style={{ gridTemplateColumns: template, transform: `translateY(${item.start}px)`, height: ROW_HEIGHT }}
								>
									{columns.map((column) => {
										const raw = row[column]
										const text = formatCell(column, raw)
										const link = column === 'name' && dirPath !== null
										const classes = ['cell']
										if (numeric.has(column)) classes.push('num')
										if (raw === null || raw === undefined) classes.push('null')
										if (link) classes.push('link')
										return (
											<div
												key={column}
												className={classes.join(' ')}
												title={link ? `cd ${dirPath}` : text}
												onClick={link ? () => onCd(dirPath) : undefined}
											>
												{text}
											</div>
										)
									})}
								</div>
							)
						})}
					</div>
				</div>
			</div>
		</div>
	)
}
