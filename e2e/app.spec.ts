import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let app: ElectronApplication
let page: Page
let sandbox: string

const mod = process.platform === 'darwin' ? 'Meta' : 'Control'

async function runLine(line: string): Promise<void> {
	const input = page.locator('.pane >> nth=0').locator('.prompt-input')
	await input.fill(line)
	await input.press('Enter')
}

test.beforeAll(async () => {
	sandbox = realpathSync(mkdtempSync(join(tmpdir(), 'oshell-e2e-')))
	mkdirSync(join(sandbox, 'alpha'))
	mkdirSync(join(sandbox, 'beta'))
	writeFileSync(join(sandbox, 'note.txt'), 'hello preview')
	app = await electron.launch({ args: ['.'] })
	page = await app.firstWindow()
	await expect(page.locator('.prompt-input')).toBeEnabled({ timeout: 20_000 })
})

test.afterAll(async () => {
	await app?.close()
})

test('runs a command and shows records as a table', async () => {
	await runLine(`cd '${sandbox}'`)
	await expect(page.locator('.prompt-cwd')).toContainText('oshell-e2e-')
	await runLine('ls')
	await expect(page.locator('.table-row', { hasText: 'alpha' })).toBeVisible()
	await expect(page.locator('.table-row', { hasText: 'note.txt' })).toBeVisible()
})

test('explorer follows the cwd and clicking a folder cds into it', async () => {
	const row = page.locator('.tree-row', { hasText: 'alpha' })
	await expect(row).toBeVisible()
	await row.click()
	await expect(page.locator('.prompt-cwd')).toContainText('alpha')
	await expect(page.locator('.tree-row.current')).toContainText('alpha')
	await runLine('pwd')
	await expect(page.locator('.table-row', { hasText: join(sandbox, 'alpha') }).last()).toBeVisible()
})

test('clicking a file previews it', async () => {
	await page.locator('.tree-row', { hasText: 'note.txt' }).click()
	await expect(page.locator('.preview-text')).toContainText('hello preview')
})

test('Tab completes a command name', async () => {
	const input = page.locator('.prompt-input')
	await input.fill('ls | wh')
	await input.press('Tab')
	await expect(input).toHaveValue('ls | where ')
	await input.fill('')
})

test('external programs run and can be cancelled', async () => {
	await runLine(`"${process.execPath}" -e "console.log('started');setTimeout(()=>{},60000)"`)
	const block = page.locator('.block').last()
	await expect(block).toContainText('started')
	await block.getByRole('button', { name: 'Cancel' }).click()
	await expect(block.locator('.status')).toContainText('cancelled', { timeout: 10_000 })
	// The engine is usable again after the kill.
	await runLine('pwd')
	await expect(page.locator('.block').last().locator('.status')).toContainText('done')
})

test('split panes and the command palette', async () => {
	await page.getByTitle('Split right').click()
	await expect(page.locator('.pane-head')).toHaveCount(2)
	await page.keyboard.press(`${mod}+Shift+P`)
	await expect(page.getByPlaceholder('Type a command or search')).toBeVisible()
	await page.keyboard.press('Escape')
})
