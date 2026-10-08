// Image types the table can show inline. Matches the preview panel's raster set.
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico'])

export function isImageName(name: string): boolean {
	const ext = name.split('.').pop()?.toLowerCase() ?? ''
	return ext !== '' && ext !== name.toLowerCase() && IMAGE_EXT.has(ext)
}

export function fileUrl(path: string): string {
	return `oshell-file://local/${encodeURIComponent(path)}`
}
