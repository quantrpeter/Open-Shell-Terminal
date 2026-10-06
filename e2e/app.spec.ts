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
	app = await electron.launch({
		args: ['.'],
		env: { ...process.env, OSHELL_ENV: join(sandbox, 'settings.json') }
	})
	page = await app.firstWindow()
	await expect(page.locator('.prompt-input')).toBeEnabled({ timeout: 20_000 })
})

test.afterAll(async () => {
	await app?.close()
})

test('runs a command and shows records as a table', async () => {
	await runLine(`cd '${sandbox}'`)
	await expect(page.locator('.prompt-cwd')).toContainText('oshell-e2e-')
	// cd prints nothing.
	const cdBlock = page.locator('.block').last()
	await expect(cdBlock).toHaveClass(/quiet/)
	await expect(cdBlock.locator('table')).toHaveCount(0)
	await runLine('ls')
	await expect(page.locator('.table-row', { hasText: 'alpha' })).toBeVisible()
	await expect(page.locator('.table-row', { hasText: 'note.txt' })).toBeVisible()
})

test('tables show every row without a filter box or inner scrollbar', async () => {
	await runLine('ls | take 3')
	const block = page.locator('.block').last()
	await expect(block.locator('tbody tr')).toHaveCount(3)
	await expect(block.locator('.filter')).toHaveCount(0)
	await block.getByRole('button', { name: 'Filter' }).click()
	await expect(block.locator('.filter')).toBeVisible()
	await page.keyboard.press('Escape')
	await expect(block.locator('.filter')).toHaveCount(0)
	const scrolls = await block.locator('.table-wrap').evaluate((el) => el.scrollHeight > el.clientHeight + 1 && getComputedStyle(el).overflowY !== 'visible')
	expect(scrolls).toBe(false)
})

test('the prompt follows the last block instead of sticking to the bottom', async () => {
	const last = await page.locator('.block').last().boundingBox()
	const prompt = await page.locator('.prompt').first().boundingBox()
	const viewport = page.viewportSize()
	expect(prompt!.y).toBeGreaterThanOrEqual(last!.y + last!.height - 1)
	expect(prompt!.y).toBeLessThan((viewport?.height ?? 900) - 120)
})

test('explorer follows the cwd and clicking a folder cds into it', async () => {
	// Hidden by default. The status bar, shortcut, and palette all drive the same toggle.
	await page.getByTitle('Command palette').click()
	await page.getByPlaceholder('Type a command or search').fill('Toggle explorer')
	await page.getByRole('option', { name: 'Toggle explorer' }).click()
	await expect(page.locator('.explorer')).toBeVisible()
	const row = page.locator('.tree-row', { hasText: 'alpha' })
	await expect(row).toBeVisible()
	await row.click()
	await expect(page.locator('.prompt-cwd')).toContainText('alpha')
	await expect(page.locator('.tree-row.current')).toContainText('alpha')
	await runLine('pwd')
	await expect(page.locator('.table-row', { hasText: join(sandbox, 'alpha') }).last()).toBeVisible()
})
test('a favorite folder pins above the tree and opens on click', async () => {
	await page.locator('.tree-row', { hasText: 'beta' }).click({ button: 'right' })
	await page.getByRole('button', { name: 'Add to favorites' }).click()
	const pin = page.locator('.fav-row', { hasText: 'beta' })
	await expect(pin).toBeVisible()
	const pinBox = await pin.boundingBox()
	const treeBox = await page.locator('.tree').boundingBox()
	expect(pinBox!.y + pinBox!.height).toBeLessThanOrEqual(treeBox!.y)
	await page.locator('.tree-row', { hasText: 'alpha' }).click()
	await pin.click()
	await expect(page.locator('.prompt-cwd')).toContainText('beta')
	await pin.getByTitle('Remove from favorites').click()
	await expect(page.locator('.fav-row')).toHaveCount(0)
})

test('clicking a file previews it', async () => {
	await page.getByTitle('Parent folder as root').click()
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
	await runLine(`ext "${process.execPath}" -e "console.log('started');setTimeout(()=>{},60000)"`)
	const block = page.locator('.block').last()
	await expect(block).toContainText('started')
	await block.getByRole('button', { name: 'Cancel' }).click()
	await expect(block.locator('.status')).toContainText('cancelled', { timeout: 10_000 })
	// The engine is usable again after the kill.
	await runLine('pwd')
	await expect(page.locator('.block').last().locator('.status')).toContainText('done')
})

test('environment dialog searches, adds, edits and deletes a setting', async () => {
	await page.getByTitle('Command palette').click()
	await page.getByPlaceholder('Type a command or search').fill('environment')
	await page.getByRole('option', { name: 'Environment variables' }).click()
	const dialog = page.getByRole('dialog', { name: 'Environment variables' })
	await expect(dialog).toBeVisible()
	await dialog.getByLabel('New name').fill('e2e_host')
	await dialog.getByLabel('New value').fill('localhost')
	await dialog.getByRole('button', { name: 'Add' }).click()
	await expect(dialog.locator('.settings-name', { hasText: 'e2e_host' })).toBeVisible()
	await dialog.getByPlaceholder('Search name or value').fill('e2e_')
	await expect(dialog.locator('.settings-row')).toHaveCount(1)
	await dialog.getByRole('button', { name: 'Edit' }).click()
	await dialog.getByLabel('Edit value').fill('remote')
	await dialog.getByRole('button', { name: 'Save' }).click()
	await expect(dialog.locator('.settings-value')).toHaveText('remote')
	await dialog.getByRole('button', { name: 'Delete' }).click()
	await expect(dialog.locator('.settings-row')).toHaveCount(0)
	await page.keyboard.press('Escape')
	await expect(dialog).toHaveCount(0)
})

test('Ctrl+L clears the screen', async () => {
	await expect(page.locator('.block').first()).toBeVisible()
	await page.locator('.prompt-input').press('Control+l')
	await expect(page.locator('.block')).toHaveCount(0)
	await runLine('pwd')
	await expect(page.locator('.block')).toHaveCount(1)
})

test('split panes and the command palette', async () => {
	await page.getByTitle('Split right').click()
	await expect(page.locator('.pane-head')).toHaveCount(2)
	await page.keyboard.press(`${mod}+Shift+P`)
	await expect(page.getByPlaceholder('Type a command or search')).toBeVisible()
	await page.keyboard.press('Escape')
})
