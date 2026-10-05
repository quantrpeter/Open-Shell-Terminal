import { spawn, type ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'
import type {
	CompleteResult,
	EngineInfo,
	RunStreamEvent,
	RunSummary,
	ShellErrorRecord
} from '../shared/types'
import type { EngineCommand } from './paths'

// How long a soft cancel gets before the whole engine process tree is killed.
const HARD_CANCEL_MS = 1500
const STDERR_TAIL = 4000

interface Pending {
	resolve: (value: unknown) => void
	reject: (error: ShellErrorRecord) => void
	onEvent?: (event: RunStreamEvent) => void
	run: boolean
	count: number
}

export interface EngineOptions {
	command: EngineCommand
	cwd: string
	platform?: NodeJS.Platform
}

function fail(code: string, message: string): ShellErrorRecord {
	return { $t: 'error', code, message }
}

export function killTree(proc: ChildProcess, platform: NodeJS.Platform): void {
	if (proc.pid === undefined) return
	if (platform === 'win32') {
		spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
		return
	}
	try {
		process.kill(-proc.pid, 'SIGKILL')
	} catch {
		proc.kill('SIGKILL')
	}
}

// One Python `openshell --rpc` process. cwd and $PWD are process-wide state in
// the shell, so each pane owns one engine; a hard cancel kills and respawns it.
export class EngineProcess {
	private proc: ChildProcess | null = null
	private pending = new Map<string, Pending>()
	private nextId = 0
	private stderrTail = ''
	private killedRun: string | null = null
	private hardTimers = new Map<string, NodeJS.Timeout>()
	private lastCwd: string
	private platform: NodeJS.Platform
	private disposed = false

	constructor(private options: EngineOptions) {
		this.lastCwd = options.cwd
		this.platform = options.platform ?? process.platform
	}

	get cwd(): string {
		return this.lastCwd
	}

	private start(): ChildProcess {
		if (this.proc) return this.proc
		const { command } = this.options
		const proc = spawn(command.python, [command.script, '--rpc'], {
			cwd: this.lastCwd,
			stdio: ['pipe', 'pipe', 'pipe'],
			windowsHide: true,
			detached: this.platform !== 'win32',
			env: {
				...process.env,
				PWD: this.lastCwd,
				PYTHONUTF8: '1',
				PYTHONIOENCODING: 'utf-8',
				NO_COLOR: '1'
			}
		})
		this.proc = proc
		this.stderrTail = ''

		createInterface({ input: proc.stdout! }).on('line', (line) => this.onLine(line))
		proc.stderr!.on('data', (chunk: Buffer) => {
			this.stderrTail = (this.stderrTail + chunk.toString('utf8')).slice(-STDERR_TAIL)
		})
		proc.stdin!.on('error', () => {
			// The exit handler reports the failure; a write to a dead pipe is expected then.
		})
		proc.on('error', (err) => {
			this.onExit(proc, `cannot start the engine (${command.python}): ${err.message}`)
		})
		proc.on('exit', (code, signal) => {
			this.onExit(proc, `engine exited (${code ?? signal})`)
		})
		return proc
	}

	private onLine(line: string): void {
		let message: { id?: string; event?: string; data?: unknown; error?: ShellErrorRecord; result?: unknown }
		try {
			message = JSON.parse(line)
		} catch {
			return
		}
		if (message.id === undefined || message.id === null) return
		const pending = this.pending.get(String(message.id))
		if (!pending) return

		if (message.event === 'records') {
			const data = message.data as unknown[]
			pending.count += data.length
			pending.onEvent?.({ type: 'records', data })
		} else if (message.event === 'error') {
			pending.onEvent?.({ type: 'error', error: message.error! })
		} else {
			this.pending.delete(String(message.id))
			const timer = this.hardTimers.get(String(message.id))
			if (timer) clearTimeout(timer)
			this.hardTimers.delete(String(message.id))
			if (message.error) {
				pending.reject(message.error)
			} else {
				if (pending.run) this.lastCwd = (message.result as RunSummary).cwd || this.lastCwd
				pending.resolve(message.result)
			}
		}
	}

	private onExit(proc: ChildProcess, reason: string): void {
		if (this.proc !== proc) return
		this.proc = null
		const tail = this.stderrTail.trim()
		const detail = tail ? `${reason}\n${tail}` : reason
		const pending = [...this.pending.entries()]
		this.pending.clear()
		for (const timer of this.hardTimers.values()) clearTimeout(timer)
		this.hardTimers.clear()
		for (const [id, item] of pending) {
			if (id === this.killedRun && item.run) {
				item.resolve({
					count: item.count,
					ms: 0,
					cwd: this.lastCwd,
					failed: false,
					cancelled: true
				} satisfies RunSummary)
			} else if (this.killedRun !== null) {
				item.reject(fail('engine.restarted', 'the engine was restarted to cancel a command'))
			} else {
				item.reject(fail('engine.crashed', detail))
			}
		}
		this.killedRun = null
	}

	private request<T>(
		method: string,
		params: Record<string, unknown>,
		options: { id?: string; run?: boolean; onEvent?: (event: RunStreamEvent) => void } = {}
	): Promise<T> {
		if (this.disposed) return Promise.reject(fail('engine.disposed', 'the engine was closed'))
		const id = options.id ?? `r${++this.nextId}`
		return new Promise<T>((resolve, reject) => {
			this.pending.set(id, {
				resolve: resolve as (value: unknown) => void,
				reject,
				onEvent: options.onEvent,
				run: options.run ?? false,
				count: 0
			})
			const proc = this.start()
			proc.stdin!.write(JSON.stringify({ id, method, params }) + '\n')
		})
	}

	async info(): Promise<EngineInfo> {
		const info = await this.request<EngineInfo>('info', {})
		this.lastCwd = info.cwd
		return info
	}

	run(runId: string, line: string, onEvent: (event: RunStreamEvent) => void): Promise<RunSummary> {
		return this.request<RunSummary>('run', { line }, { id: runId, run: true, onEvent })
	}

	cancel(runId: string): void {
		const proc = this.proc
		if (!proc || !this.pending.has(runId)) return
		proc.stdin!.write(JSON.stringify({ method: 'cancel', params: { id: runId } }) + '\n')
		if (this.hardTimers.has(runId)) return
		this.hardTimers.set(
			runId,
			setTimeout(() => {
				this.hardTimers.delete(runId)
				if (!this.pending.has(runId) || this.proc !== proc) return
				// Runs are serial: a queued run is cancelled by the engine when it starts.
				const active = [...this.pending.entries()].find(([, item]) => item.run)?.[0]
				if (active !== runId) return
				this.killedRun = runId
				killTree(proc, this.platform)
			}, HARD_CANCEL_MS)
		)
	}

	complete(line: string, cursor: number): Promise<CompleteResult> {
		return this.request<CompleteResult>('complete', { line, cursor })
	}

	async history(): Promise<string[]> {
		const result = await this.request<{ history: string[] }>('history', {})
		return result.history
	}

	dispose(): void {
		this.disposed = true
		const proc = this.proc
		if (!proc) return
		try {
			proc.stdin!.write(JSON.stringify({ id: 'bye', method: 'shutdown', params: {} }) + '\n')
		} catch {
			// already gone
		}
		setTimeout(() => killTree(proc, this.platform), 300).unref()
	}
}
