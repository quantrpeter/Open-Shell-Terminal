import { useEffect, useState } from 'react'
import type { Preview, SheetPreview } from '../../../shared/types'
import { useStore } from '../store'
import { Icon } from './Icon'

function prettyJson(text: string): string {
	try {
		return JSON.stringify(JSON.parse(text), null, 2)
	} catch {
		return text
	}
}

export function PreviewPanel(): React.JSX.Element {
	const path = useStore((s) => s.previewPath)
	const { setPreview, toggle } = useStore.getState()
	const [preview, setLoaded] = useState<Preview | null>(null)

	useEffect(() => {
		setLoaded(null)
		if (!path) return
		let cancelled = false
		void window.oshell.fs.preview(path).then((result) => {
			if (!cancelled) setLoaded(result)
		})
		return () => {
			cancelled = true
		}
	}, [path])

	const body = (): React.JSX.Element => {
		if (!path) return <div className="muted pad">Click a file, or run preview FILE.</div>
		if (!preview) return <div className="muted pad">Loading&hellip;</div>
		switch (preview.kind) {
			case 'text':
				return (
					<pre className="raw preview-text">
						{preview.ext === '.json' ? prettyJson(preview.text) : preview.text}
						{preview.truncated && '\n\u2026 truncated'}
					</pre>
				)
			case 'image':
				return <img className="preview-image" src={preview.dataUrl} alt={preview.name} />
			case 'media':
				return preview.media === 'video' ? (
					<video className="preview-media" src={preview.url} controls />
				) : (
					<iframe className="preview-frame" src={preview.url} title={preview.name} />
				)
			case 'sheet':
				return <SheetView sheets={preview.sheets} />
			case 'binary':
				return <div className="muted pad">Binary file ({preview.size} bytes)</div>
			case 'too-large':
				return <div className="muted pad">Too large to preview ({preview.size} bytes)</div>
			case 'dir':
				return <div className="muted pad">Folder</div>
			case 'error':
				return <div className="error pad">{preview.message}</div>
		}
	}

	return (
		<div className="preview">
			<div className="explorer-head">
				<span className="explorer-title" title={path ?? ''}>
					{preview && 'name' in preview ? preview.name : 'Preview'}
				</span>
				<button className="icon-btn" title="Close preview" onClick={() => (setPreview(null), toggle('showPreview'))}>
					<Icon name="close" />
				</button>
			</div>
			<div className={preview?.kind === 'media' || preview?.kind === 'sheet' ? 'preview-body fill' : 'preview-body'}>{body()}</div>
		</div>
	)
}

function SheetView({ sheets }: { sheets: SheetPreview[] }): React.JSX.Element {
	const [active, setActive] = useState(0)
	const sheet = sheets[active]
	if (!sheet) return <div className="muted pad">Empty workbook</div>
	const width = Math.max(1, ...sheet.rows.map((row) => row.length))
	return (
		<div className="sheet-view">
			<div className="sheet-scroll">
				<table className="sheet">
					<tbody>
						{sheet.rows.map((row, index) => (
							<tr key={index}>
								<th>{index + 1}</th>
								{Array.from({ length: width }, (_, col) => (
									<td key={col}>{row[col] ?? ''}</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
				{sheet.truncated && <div className="muted pad">Showing the first 200 rows and 26 columns.</div>}
			</div>
			{sheets.length > 1 && (
				<div className="sheet-tabs">
					{sheets.map((item, index) => (
						<button key={item.name} className={index === active ? 'sheet-tab active' : 'sheet-tab'} onClick={() => setActive(index)}>
							{item.name}
						</button>
					))}
				</div>
			)}
		</div>
	)
}
