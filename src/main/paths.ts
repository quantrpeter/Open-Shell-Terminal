import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

export interface EngineCommand {
	python: string
	script: string
}

export interface ResolveOptions {
	packaged: boolean
	resourcesPath: string
	appRoot: string
	platform: NodeJS.Platform
	env: NodeJS.ProcessEnv
}

// Where the Python engine lives: the bundled runtime when packaged, otherwise
// the sibling Open-Shell checkout and whatever Python is on PATH.
export function resolveEngine(options: ResolveOptions): EngineCommand {
	const { env, platform } = options
	const windows = platform === 'win32'
	if (env.OSHELL_PYTHON && env.OSHELL_ENGINE) {
		return { python: env.OSHELL_PYTHON, script: env.OSHELL_ENGINE }
	}
	if (options.packaged) {
		const runtime = join(options.resourcesPath, 'python')
		return {
			python: env.OSHELL_PYTHON ?? (windows ? join(runtime, 'python.exe') : join(runtime, 'bin', 'python3')),
			script: env.OSHELL_ENGINE ?? join(options.resourcesPath, 'engine', 'openshell.py')
		}
	}
	return {
		python: env.OSHELL_PYTHON ?? (windows ? 'python' : 'python3'),
		script: env.OSHELL_ENGINE ?? resolve(options.appRoot, '..', 'Open-Shell', 'openshell.py')
	}
}

export function engineProblem(command: EngineCommand): string | null {
	if (!existsSync(command.script)) {
		return `Open Shell engine not found at ${command.script}. Set OSHELL_ENGINE to openshell.py.`
	}
	return null
}
