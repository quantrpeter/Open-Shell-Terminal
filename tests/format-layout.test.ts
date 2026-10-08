import { describe, expect, it } from 'vitest'
import { classify, columnsOf, compareValues, formatCell, formatDuration, humanSize, isQuietLine, previewPathOf, toCsv } from '../src/renderer/src/lib/format'
import { fileUrl, isImageName } from '../src/renderer/src/lib/image'
import { paneIds, removePane, splitPane, type LayoutNode } from '../src/renderer/src/lib/layout'

describe('image rows', () => {
	it('treats common image names as thumbnails', () => {
		expect(isImageName('a.png')).toBe(true)
		expect(isImageName('photo.JPEG')).toBe(true)
		expect(isImageName('notes.txt')).toBe(false)
		expect(isImageName('png')).toBe(false)
	})
	it('builds an oshell-file url', () => {
		expect(fileUrl('/tmp/a.png')).toBe('oshell-file://local/%2Ftmp%2Fa.png')
	})
})

describe('format', () => {
	it('humanSize matches the shell', () => {
		expect(humanSize(512)).toBe('512B')
		expect(humanSize(1536)).toBe('1.5K')
		expect(humanSize(5 * 1024 ** 2)).toBe('5.0M')
	})
	it('formatCell types size and dates, leaves strings', () => {
		expect(formatCell('size', 2048)).toBe('2.0K')
		expect(formatCell('modified', 0)).toMatch(/^19\d\d-\d\d-\d\d \d\d:\d\d:\d\d$/)
		expect(formatCell('name', 'x')).toBe('x')
		expect(formatCell('is_dir', true)).toBe('true')
		expect(formatCell('x', null)).toBe('')
		expect(formatCell('x', { a: 1 })).toBe('{"a":1}')
	})
	it('compareValues orders null < numbers < strings', () => {
		const sorted = ['b', 3, null, 'a', 1].sort(compareValues)
		expect(sorted).toEqual([null, 1, 3, 'a', 'b'])
	})
	it('columnsOf keeps first-seen order and skips $t', () => {
		expect(columnsOf([{ a: 1, $t: 'x' }, { b: 2, a: 3 }])).toEqual(['a', 'b'])
	})
	it('toCsv quotes commas, quotes and newlines', () => {
		expect(toCsv([{ a: 'x,y', b: 'say "hi"' }, { a: 'l1\nl2', b: null }])).toBe('a,b\n"x,y","say ""hi"""\n"l1\nl2",')
	})
	it('classify picks a view', () => {
		expect(classify([]).kind).toBe('empty')
		expect(classify([{ $t: 'text', text: 'hi' }]).kind).toBe('text')
		expect(classify([{ line: 'a', stream: 'stdout' }]).kind).toBe('log')
		expect(classify([{ a: 1 }, { a: 2 }]).kind).toBe('table')
		expect(classify([1, 2]).kind).toBe('json')
		expect(classify([{ line: 'a' }]).kind).toBe('table')
	})
	it('formatDuration', () => {
		expect(formatDuration(12)).toBe('12ms')
		expect(formatDuration(1500)).toBe('1.50s')
		expect(formatDuration(12000)).toBe('12.0s')
	})
	it('previewPathOf reads a preview record and ignores other rows', () => {
		expect(previewPathOf([{ $t: 'preview', fullpath: '/tmp/a.txt' }])).toBe('/tmp/a.txt')
		expect(previewPathOf([{ name: 'a' }, { $t: 'text', fullpath: '/tmp/a.txt' }])).toBeNull()
		expect(previewPathOf([{ $t: 'preview' }])).toBeNull()
	})
	it('isQuietLine only matches a plain cd', () => {
		expect(isQuietLine('cd')).toBe(true)
		expect(isQuietLine("cd '/a b'")).toBe(true)
		expect(isQuietLine('  cd ..')).toBe(true)
		expect(isQuietLine('cdrom')).toBe(false)
		expect(isQuietLine('cd x | take 1')).toBe(false)
		expect(isQuietLine('ls')).toBe(false)
	})
})

describe('layout', () => {
	const single: LayoutNode = { kind: 'pane', paneId: 'a' }
	it('splits a pane', () => {
		const next = splitPane(single, 'a', 'row', 'b')
		expect(paneIds(next)).toEqual(['a', 'b'])
	})
	it('adds a sibling instead of nesting in the same direction', () => {
		const two = splitPane(single, 'a', 'row', 'b')
		const three = splitPane(two, 'a', 'row', 'c')
		expect(three).toEqual({
			kind: 'split',
			dir: 'row',
			children: [
				{ kind: 'pane', paneId: 'a' },
				{ kind: 'pane', paneId: 'c' },
				{ kind: 'pane', paneId: 'b' }
			]
		})
	})
	it('nests when the direction differs', () => {
		const next = splitPane(splitPane(single, 'a', 'row', 'b'), 'b', 'column', 'c')
		expect(paneIds(next)).toEqual(['a', 'b', 'c'])
		expect(next.kind === 'split' && next.children[1].kind).toBe('split')
	})
	it('removing collapses single-child splits', () => {
		const two = splitPane(single, 'a', 'row', 'b')
		expect(removePane(two, 'a')).toEqual({ kind: 'pane', paneId: 'b' })
		expect(removePane(single, 'a')).toBeNull()
	})
})
