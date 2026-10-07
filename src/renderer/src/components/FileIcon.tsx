import { Icon } from './Icon'

// Brand-colored marks for common types. Material Symbols has no Excel/Word/PDF
// glyphs, so those are small inline SVGs in the familiar product colors.

type Kind =
	| 'folder'
	| 'excel'
	| 'word'
	| 'powerpoint'
	| 'pdf'
	| 'image'
	| 'video'
	| 'audio'
	| 'code'
	| 'archive'
	| 'text'
	| 'data'
	| 'config'
	| 'font'
	| 'disk'
	| 'file'

const EXT: Record<string, Kind> = {
	xls: 'excel',
	xlsx: 'excel',
	xlsm: 'excel',
	xlsb: 'excel',
	xltx: 'excel',
	csv: 'excel',
	tsv: 'excel',
	ods: 'excel',
	numbers: 'excel',
	doc: 'word',
	docx: 'word',
	docm: 'word',
	dotx: 'word',
	rtf: 'word',
	odt: 'word',
	pages: 'word',
	ppt: 'powerpoint',
	pptx: 'powerpoint',
	pptm: 'powerpoint',
	odp: 'powerpoint',
	key: 'powerpoint',
	pdf: 'pdf',
	png: 'image',
	jpg: 'image',
	jpeg: 'image',
	gif: 'image',
	webp: 'image',
	svg: 'image',
	ico: 'image',
	bmp: 'image',
	tif: 'image',
	tiff: 'image',
	heic: 'image',
	avif: 'image',
	mp4: 'video',
	mov: 'video',
	mkv: 'video',
	avi: 'video',
	webm: 'video',
	m4v: 'video',
	mp3: 'audio',
	wav: 'audio',
	flac: 'audio',
	aac: 'audio',
	ogg: 'audio',
	m4a: 'audio',
	zip: 'archive',
	tar: 'archive',
	gz: 'archive',
	tgz: 'archive',
	bz2: 'archive',
	xz: 'archive',
	'7z': 'archive',
	rar: 'archive',
	dmg: 'disk',
	iso: 'disk',
	txt: 'text',
	md: 'text',
	markdown: 'text',
	log: 'text',
	rst: 'text',
	json: 'data',
	jsonl: 'data',
	xml: 'data',
	yaml: 'data',
	yml: 'data',
	toml: 'data',
	ini: 'config',
	conf: 'config',
	cfg: 'config',
	env: 'config',
	properties: 'config',
	js: 'code',
	jsx: 'code',
	mjs: 'code',
	cjs: 'code',
	ts: 'code',
	tsx: 'code',
	py: 'code',
	pyi: 'code',
	rb: 'code',
	go: 'code',
	rs: 'code',
	java: 'code',
	kt: 'code',
	c: 'code',
	h: 'code',
	cpp: 'code',
	hpp: 'code',
	cs: 'code',
	php: 'code',
	swift: 'code',
	sh: 'code',
	bash: 'code',
	zsh: 'code',
	ps1: 'code',
	sql: 'code',
	html: 'code',
	htm: 'code',
	css: 'code',
	scss: 'code',
	vue: 'code',
	lua: 'code',
	ttf: 'font',
	otf: 'font',
	woff: 'font',
	woff2: 'font'
}

function kindOf(name: string, isDir: boolean): Kind {
	if (isDir) return 'folder'
	const ext = name.split('.').pop()?.toLowerCase() ?? ''
	if (!ext || ext === name.toLowerCase()) return 'file'
	return EXT[ext] ?? 'file'
}

function Mark({ kind }: { kind: Kind }): React.JSX.Element {
	if (kind === 'folder') return <Icon name="folder" />
	if (kind === 'excel') return <Excel />
	if (kind === 'word') return <Word />
	if (kind === 'powerpoint') return <PowerPoint />
	if (kind === 'pdf') return <Pdf />
	const symbol: Record<Exclude<Kind, 'folder' | 'excel' | 'word' | 'powerpoint' | 'pdf'>, string> = {
		image: 'image',
		video: 'movie',
		audio: 'audio_file',
		code: 'code',
		archive: 'folder_zip',
		text: 'description',
		data: 'data_object',
		config: 'settings',
		font: 'font_download',
		disk: 'album',
		file: 'draft'
	}
	return <Icon name={symbol[kind]} />
}

export function FileIcon({ name, isDir }: { name: string; isDir: boolean }): React.JSX.Element {
	const kind = kindOf(name, isDir)
	return (
		<span className={isDir ? 'file-icon dir' : `file-icon kind-${kind}`}>
			<Mark kind={kind} />
		</span>
	)
}

function Excel(): React.JSX.Element {
	return (
		<svg className="type-mark" viewBox="0 0 16 16" aria-hidden="true">
			<rect width="16" height="16" rx="2" fill="#217346" />
			<path fill="#fff" d="M3.2 4.2h2.1l1.7 2.7 1.7-2.7h2.1L8.4 8l2.4 3.8H8.7L7 9.1l-1.7 2.7H3.2L5.6 8 3.2 4.2z" />
		</svg>
	)
}

function Word(): React.JSX.Element {
	return (
		<svg className="type-mark" viewBox="0 0 16 16" aria-hidden="true">
			<rect width="16" height="16" rx="2" fill="#2B579A" />
			<path fill="#fff" d="M3 4h1.7l1.1 5.2L7 4h1.8l1.2 5.2L11.1 4H13l-2.1 8H9.1L8 6.6 6.9 12H5.1L3 4z" />
		</svg>
	)
}

function PowerPoint(): React.JSX.Element {
	return (
		<svg className="type-mark" viewBox="0 0 16 16" aria-hidden="true">
			<rect width="16" height="16" rx="2" fill="#D24726" />
			<path fill="#fff" d="M5 3.6h3.3c1.9 0 3 1 3 2.6S10.2 8.8 8.3 8.8H6.7V12.4H5V3.6zm1.7 1.4v2.4h1.4c.9 0 1.4-.4 1.4-1.2s-.5-1.2-1.4-1.2H6.7z" />
		</svg>
	)
}

function Pdf(): React.JSX.Element {
	return (
		<svg className="type-mark" viewBox="0 0 16 16" aria-hidden="true">
			<rect width="16" height="16" rx="2" fill="#E5252A" />
			<path
				fill="#fff"
				d="M2.3 6.1h1.3c.9 0 1.4.4 1.4 1.1 0 .7-.5 1.1-1.4 1.1H3.2v1.3H2.3V6.1zm.9.7v.8h.3c.4 0 .6-.1.6-.4s-.2-.4-.6-.4h-.3zM6 6.1h1.4c1 0 1.6.5 1.6 1.7 0 1.2-.6 1.8-1.6 1.8H6V6.1zm.9.7v2.1h.4c.5 0 .8-.3.8-1.1s-.3-1-.8-1H6.9zM9.8 6.1H13v.7h-2.3v.8h2.1v.7h-2.1v1.3H9.8V6.1z"
			/>
		</svg>
	)
}
