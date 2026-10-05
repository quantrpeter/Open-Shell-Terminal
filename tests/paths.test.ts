import { describe, expect, it } from 'vitest'
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
