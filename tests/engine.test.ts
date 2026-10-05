import { mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { EngineProcess } from '../src/main/engine'
import { resolveEngine } from '../src/main/paths'
import type { RunStreamEvent } from '../src/shared/types'

const command = resolveEngine({
	packaged: false,
	resourcesPath: '',
	appRoot: resolve(__dirname, '..'),
	platform: process.platform,
	env: process.env
})

const engines: EngineProcess[] = []
function engine(cwd = realpathSync(tmpdir())): EngineProcess {
	const created = new EngineProcess({ command, cwd })
	engines.push(created)
	return created
}

afterEach(() => {
	for (const item of engines.splice(0)) item.dispose()
})

function collect(): { events: RunStreamEvent[]; onEvent: (event: RunStreamEvent) => void; records: () => unknown[] } {
	const events: RunStreamEvent[] = []
	return {
		events,
		onEvent: (event) => events.push(event),
		records: () => events.flatMap((event) => (event.type === 'records' ? event.data : []))
	}
}

describe('EngineProcess (real Python engine)', () => {
	it('reports info with the starting directory', async () => {
		const dir = realpathSync(mkdtempSync(join(tmpdir(), 'oshell-')))
		const info = await engine(dir).info()
		expect(info.protocol).toBe(1)
		expect(realpathSync(info.cwd)).toBe(dir)
		expect(info.commands.map((c) => c.name)).toContain('ls')
	})

	it('streams records and a summary', async () => {
		const eng = engine()
		const sink = collect()
		const result = await eng.run('r1', 'ls | take 2', sink.onEvent)
		expect(sink.records().length).toBeLessThanOrEqual(2)
		expect(result.failed).toBe(false)
		expect(result.count).toBe(sink.records().length)
	})

	it('tracks the cwd across runs', async () => {
		const dir = realpathSync(mkdtempSync(join(tmpdir(), 'oshell-')))
		const eng = engine()
		const result = await eng.run('r1', `cd '${dir}'`, () => {})
		expect(realpathSync(result.cwd)).toBe(dir)
		expect(realpathSync(eng.cwd)).toBe(dir)
	})

	it('reports errors as events', async () => {
		const sink = collect()
		const result = await engine().run('r1', 'definitely-not-a-command', sink.onEvent)
		expect(result.failed).toBe(true)
		const error = sink.events.find((e) => e.type === 'error')
		expect(error && error.type === 'error' && error.error.code).toBe('cmd.not_found')
	})

	it('completes', async () => {
		const result = await engine().complete('ls | wh', 7)
		expect(result.items).toContain('where')
	})

	it('hard-kills a blocked engine and recovers in the same directory', async () => {
		const dir = realpathSync(mkdtempSync(join(tmpdir(), 'oshell-')))
		const eng = engine(dir)
		await eng.info()
		// A builtin that blocks before yielding cannot be stopped softly; `ls -r /` collects first.
		const sink = collect()
		const running = eng.run('slow', 'ls -r /', sink.onEvent)
		await new Promise((r) => setTimeout(r, 200))
		eng.cancel('slow')
		const result = await running
		expect(result.cancelled).toBe(true)
		const after = await eng.run('after', 'pwd', () => {})
		expect(after.failed).toBe(false)
		expect(realpathSync(after.cwd)).toBe(dir)
	}, 30000)

	it('rejects pending requests when the engine cannot start', async () => {
		const broken = new EngineProcess({
			command: { python: 'definitely-not-python', script: command.script },
			cwd: realpathSync(tmpdir())
		})
		engines.push(broken)
		await expect(broken.info()).rejects.toMatchObject({ code: 'engine.crashed' })
	})
})
