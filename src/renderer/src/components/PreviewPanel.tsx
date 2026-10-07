import { useEffect, useState } from 'react'
import type { Preview } from '../../../shared/types'
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
		if (!path) return <div className="muted pad">Click a file in the explorer to preview it.</div>
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
			<div className="preview-body">{body()}</div>
		</div>
	)
}
