import { useDeferredValue, useMemo, useState } from 'react'
import { columnsOf, compareValues, formatCell, type Row } from '../lib/format'

// Rows rendered before "Show all"; keeps a huge result from freezing the page.
const ROW_CAP = 5000

interface Sort {
	column: string
	dir: 1 | -1
}

interface Props {
	rows: Row[]
	version: number
	filter: string
	onCd(path: string): void
}

// Plain table that shows every row. Sorting and filtering run in the renderer
// over the rows received so far.
export function RecordTable({ rows, version, filter, onCd }: Props): React.JSX.Element {
	const [sort, setSort] = useState<Sort | null>(null)
	const [limit, setLimit] = useState(ROW_CAP)
	const settled = useDeferredValue(version)

	const columns = useMemo(() => columnsOf(rows), [rows, settled])
	const numeric = useMemo(
		() =>
			new Set(
				columns.filter((c) => c === 'size' || rows.every((row) => row[c] == null || typeof row[c] === 'number'))
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

	const toggleSort = (column: string): void => {
		setSort((prev) => {
			if (!prev || prev.column !== column) return { column, dir: 1 }
			return prev.dir === 1 ? { column, dir: -1 } : null
		})
	}

	const shown = visible.length > limit ? visible.slice(0, limit) : visible

	return (
		<div className="table-wrap">
			<table className="records">
				<thead>
					<tr>
						{columns.map((column) => (
							<th key={column} className={numeric.has(column) ? 'num' : ''} onClick={() => toggleSort(column)}>
								{column}
								{sort?.column === column && <span className="arrow">{sort.dir === 1 ? ' \u25b2' : ' \u25bc'}</span>}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{shown.map((row, index) => {
						const dirPath = row.is_dir === true && typeof row.fullpath === 'string' ? row.fullpath : null
						return (
							<tr key={index} className="table-row">
								{columns.map((column) => {
									const raw = row[column]
									const text = formatCell(column, raw)
									const link = column === 'name' && dirPath !== null
									const classes: string[] = []
									if (numeric.has(column)) classes.push('num')
									if (raw === null || raw === undefined) classes.push('null')
									if (link) classes.push('link')
									if (text.length > 60) classes.push('wrap')
									return (
										<td
											key={column}
											className={classes.join(' ')}
											title={link ? `cd ${dirPath}` : undefined}
											onClick={link ? () => onCd(dirPath) : undefined}
										>
											{text}
										</td>
									)
								})}
							</tr>
						)
					})}
				</tbody>
			</table>
			{visible.length > limit && (
				<button className="btn more" onClick={() => setLimit(Infinity)}>
					Show all {visible.length} rows
				</button>
			)}
			{filter.trim() !== '' && visible.length === 0 && <div className="empty muted">No rows match the filter.</div>}
		</div>
	)
}
