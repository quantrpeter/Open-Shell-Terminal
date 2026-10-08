import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join as joinPath } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isPythonExecutable, pythonNames } from '../src/main/paths'
import { readWindowState, visibleWindowState, writeWindowState, type WindowState } from '../src/main/window-state'
import type { Rectangle, Screen } from 'electron'
import { basename, breadcrumbs, chain, dirname, isRoot, isUnder, join, samePath } from '../src/shared/paths'
import { shellQuote } from '../src/shared/quote'

describe('paths (POSIX)', () => {
	it('dirname and basename', () => {
		expect(dirname('/a/b/c')).toBe('/a/b')
		expect(dirname('/a')).toBe('/')
		expect(dirname('/')).toBe('/')
		expect(basename('/a/b/c/')).toBe('c')
		expect(basename('/')).toBe('/')
	})
	it('join', () => {
		expect(join('/a', 'b')).toBe('/a/b')
		expect(join('/', 'b')).toBe('/b')
	})
	it('isUnder does not match sibling prefixes', () => {
		expect(isUnder('/a/b', '/a/b/c')).toBe(true)
		expect(isUnder('/a/b', '/a/b')).toBe(true)
		expect(isUnder('/a/b', '/a/bc')).toBe(false)
		expect(isUnder('/', '/anything')).toBe(true)
	})
	it('chain lists directories from the root down', () => {
		expect(chain('/a', '/a/b/c')).toEqual(['/a', '/a/b', '/a/b/c'])
		expect(chain('/a', '/a')).toEqual(['/a'])
		expect(chain('/a', '/x/y')).toEqual([])
	})
	it('breadcrumbs', () => {
		expect(breadcrumbs('/a/b').map((c) => c.name)).toEqual(['/', 'a', 'b'])
	})
})

describe('paths (Windows)', () => {
	it('dirname and basename keep the drive root', () => {
		expect(dirname('C:\\Users\\me')).toBe('C:\\Users')
		expect(dirname('C:\\Users')).toBe('C:\\')
		expect(dirname('C:\\')).toBe('C:\\')
		expect(basename('C:\\Users\\me\\')).toBe('me')
		expect(isRoot('C:\\')).toBe(true)
		expect(isRoot('C:\\Users')).toBe(false)
	})
	it('compares case-insensitively', () => {
		expect(samePath('C:\\Users\\Me', 'c:\\users\\me\\')).toBe(true)
		expect(isUnder('C:\\Users', 'c:\\users\\me')).toBe(true)
	})
	it('UNC roots', () => {
		expect(dirname('\\\\srv\\share\\dir')).toBe('\\\\srv\\share\\')
		expect(isRoot('\\\\srv\\share\\')).toBe(true)
	})
	it('join uses backslashes', () => {
		expect(join('C:\\Users', 'me')).toBe('C:\\Users\\me')
		expect(join('C:\\', 'me')).toBe('C:\\me')
	})
})

describe('python executable names', () => {
	it('accepts versioned interpreters and rejects lookalikes', () => {
		expect(pythonNames('darwin')).toEqual(['python3', 'python'])
		expect(isPythonExecutable('python3.14', 'darwin')).toBe(true)
		expect(isPythonExecutable('python3', 'win32')).toBe(false)
		expect(isPythonExecutable('python3.14.exe', 'win32')).toBe(true)
		expect(isPythonExecutable('python3-config', 'darwin')).toBe(false)
	})
})

function screenOf(areas: Rectangle[]): Screen {
	return { getAllDisplays: () => areas.map((workArea) => ({ workArea })) } as unknown as Screen
}

describe('window state', () => {
	const saved: WindowState = { x: 40, y: 20, width: 900, height: 600, maximized: true }

	it('round-trips bounds and drops a corrupt file', () => {
		const dir = mkdtempSync(joinPath(tmpdir(), 'oshell-win-'))
		try {
			writeWindowState(dir, saved)
			expect(readWindowState(dir)).toEqual(saved)
			expect(JSON.parse(readFileSync(joinPath(dir, 'window.json'), 'utf8'))).toEqual(saved)
			writeFileSync(joinPath(dir, 'window.json'), '{')
			expect(readWindowState(dir)).toBeNull()
		} finally {
			rmSync(dir, { recursive: true, force: true })
		}
	})

	it('keeps a frame that still meets a display and drops one that does not', () => {
		const displays = screenOf([{ x: 0, y: 0, width: 1440, height: 900 }])
		expect(visibleWindowState(saved, displays)).toEqual(saved)
		expect(visibleWindowState({ ...saved, x: 4000 }, displays)).toBeNull()
		expect(visibleWindowState(null, displays)).toBeNull()
	})
})

describe('shellQuote', () => {
	it('leaves safe paths alone', () => {
		expect(shellQuote('/usr/local/bin', false)).toBe('/usr/local/bin')
		expect(shellQuote('C:\\Users\\me', true)).toBe('"C:\\Users\\me"')
	})
	it('single-quotes on POSIX and escapes quotes', () => {
		expect(shellQuote('/my dir/it\'s', false)).toBe("'/my dir/it'\\''s'")
		expect(shellQuote('', false)).toBe("''")
	})
	it('double-quotes on Windows', () => {
		expect(shellQuote('C:\\Program Files\\x', true)).toBe('"C:\\Program Files\\x"')
	})
})
