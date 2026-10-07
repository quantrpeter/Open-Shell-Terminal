import { deflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { readPreview } from '../src/main/fs'

function zip(files: Record<string, string>): Buffer {
	const locals: Buffer[] = []
	const centrals: Buffer[] = []
	let offset = 0
	for (const [name, text] of Object.entries(files)) {
		const data = deflateRawSync(Buffer.from(text))
		const nameBytes = Buffer.from(name)
		const local = Buffer.alloc(30 + nameBytes.length + data.length)
		local.writeUInt32LE(0x04034b50, 0)
		local.writeUInt16LE(20, 4)
		local.writeUInt16LE(8, 8)
		local.writeUInt32LE(data.length, 18)
		local.writeUInt32LE(Buffer.byteLength(text), 22)
		local.writeUInt16LE(nameBytes.length, 26)
		nameBytes.copy(local, 30)
		data.copy(local, 30 + nameBytes.length)
		locals.push(local)

		const central = Buffer.alloc(46 + nameBytes.length)
		central.writeUInt32LE(0x02014b50, 0)
		central.writeUInt16LE(20, 4)
		central.writeUInt16LE(20, 6)
		central.writeUInt16LE(8, 10)
		central.writeUInt32LE(data.length, 20)
		central.writeUInt32LE(Buffer.byteLength(text), 24)
		central.writeUInt16LE(nameBytes.length, 28)
		central.writeUInt32LE(offset, 42)
		nameBytes.copy(central, 46)
		centrals.push(central)
		offset += local.length
	}
	const central = Buffer.concat(centrals)
	const end = Buffer.alloc(22)
	end.writeUInt32LE(0x06054b50, 0)
	end.writeUInt16LE(centrals.length, 8)
	end.writeUInt16LE(centrals.length, 10)
	end.writeUInt32LE(central.length, 12)
	end.writeUInt32LE(offset, 16)
	return Buffer.concat([...locals, central, end])
}

describe('xlsx preview', () => {
	it('reads shared strings, numbers, and a second sheet', async () => {
		const buffer = zip({
			'xl/sharedStrings.xml': '<sst><si><t>Name</t></si><si><t>Ada &amp; Bob</t></si></sst>',
			'xl/workbook.xml':
				'<workbook><sheets><sheet name="People" sheetId="1" r:id="rId1"/><sheet name="Empty" sheetId="2" r:id="rId2"/></sheets></workbook>',
			'xl/_rels/workbook.xml.rels':
				'<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>',
			'xl/worksheets/sheet1.xml':
				'<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>Score</t></is></c></row><row r="3"><c r="A3" t="s"><v>1</v></c><c r="C3"><v>42</v></c></row></sheetData></worksheet>',
			'xl/worksheets/sheet2.xml': '<worksheet><sheetData></sheetData></worksheet>'
		})
		const preview = await readPreview('/tmp/sample.xlsx', undefined, buffer)
		expect(preview.kind).toBe('sheet')
		if (preview.kind !== 'sheet') return
		expect(preview.sheets.map((sheet) => sheet.name)).toEqual(['People', 'Empty'])
		expect(preview.sheets[0].rows[0]).toEqual(['Name', 'Score'])
		expect(preview.sheets[0].rows[1]).toEqual([])
		expect(preview.sheets[0].rows[2]).toEqual(['Ada & Bob', undefined, '42'])
	})
})

describe('docx preview', () => {
	it('joins runs into paragraphs and decodes entities', async () => {
		const buffer = zip({
			'word/document.xml':
				'<w:document><w:body><w:p><w:r><w:t>Hello </w:t></w:r><w:r><w:t>Ada &amp; Bob</w:t></w:r></w:p><w:p><w:r><w:t>Second</w:t></w:r></w:p></w:body></w:document>'
		})
		const preview = await readPreview('/tmp/sample.docx', undefined, buffer)
		expect(preview).toMatchObject({ kind: 'text', text: 'Hello Ada & Bob\nSecond', ext: '.docx' })
	})
})
