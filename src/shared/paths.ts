// Path helpers that work on both POSIX and Windows paths without Node's `path`,
// so the renderer can use them.

export function sepFor(path: string): string {
	return /^[A-Za-z]:[\\/]|^\\\\/.test(path) || (path.includes('\\') && !path.includes('/')) ? '\\' : '/'
}

function trimTrailing(path: string, sep: string): string {
	let end = path.length
	const min = rootLength(path)
	while (end > min && (path[end - 1] === '/' || path[end - 1] === sep)) end--
	return path.slice(0, end)
}

// Length of the root prefix: `/`, `C:\`, or `\\server\share\`.
function rootLength(path: string): number {
	if (/^[A-Za-z]:[\\/]/.test(path)) return 3
	if (path.startsWith('\\\\')) {
		const parts = path.slice(2).split('\\')
		return parts.length >= 2 ? 2 + parts[0].length + 1 + parts[1].length + 1 : path.length
	}
	return path.startsWith('/') ? 1 : 0
}

export function isRoot(path: string): boolean {
	const root = rootLength(path)
	return root > 0 && trimTrailing(path, sepFor(path)).length <= root
}

export function dirname(path: string): string {
	const sep = sepFor(path)
	const clean = trimTrailing(path, sep)
	if (isRoot(clean)) return clean
	const index = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'))
	if (index < 0) return clean
	const root = rootLength(clean)
	return index < root ? clean.slice(0, root) : clean.slice(0, index)
}

export function basename(path: string): string {
	const sep = sepFor(path)
	const clean = trimTrailing(path, sep)
	if (isRoot(clean)) return clean
	const index = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'))
	return clean.slice(index + 1)
}

export function join(dir: string, name: string): string {
	const sep = sepFor(dir)
	return dir.endsWith('/') || dir.endsWith('\\') ? dir + name : dir + sep + name
}

function normalizeForCompare(path: string): string {
	const sep = sepFor(path)
	const clean = trimTrailing(path, sep).replace(/\\/g, '/')
	return sep === '\\' ? clean.toLowerCase() : clean
}

export function samePath(a: string, b: string): boolean {
	return normalizeForCompare(a) === normalizeForCompare(b)
}

export function isUnder(root: string, path: string): boolean {
	const r = normalizeForCompare(root)
	const p = normalizeForCompare(path)
	if (p === r) return true
	return p.startsWith(r.endsWith('/') ? r : r + '/')
}

// Directories from `root` down to `path`, both ends included. Empty when
// `path` is not inside `root`.
export function chain(root: string, path: string): string[] {
	if (!isUnder(root, path)) return []
	const result = [path]
	let current = path
	while (!samePath(current, root)) {
		const parent = dirname(current)
		if (samePath(parent, current)) break
		result.push(parent)
		current = parent
	}
	return result.reverse().map((item, index) => (index === 0 ? root : item))
}

export function breadcrumbs(path: string): { name: string; path: string }[] {
	const parts: { name: string; path: string }[] = []
	let current = path
	for (;;) {
		parts.push({ name: basename(current) || current, path: current })
		const parent = dirname(current)
		if (samePath(parent, current)) break
		current = parent
	}
	return parts.reverse()
}
