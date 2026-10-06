import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join, isAbsolute, resolve } from 'node:path'

export interface EngineCommand {
	python: string
	script: string
}

export interface PythonChoice {
	path: string
	version: string
	label: string
	source: 'selected' | 'default' | 'bundled' | 'path'
}

const CONFIG = 'python.json'

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
	if (isAbsolute(command.python) && !existsSync(command.python)) {
		return `Python runtime not found at ${command.python}. Run "npm run fetch:python" before "npm run dist", or set OSHELL_PYTHON.`
	}
	if (!existsSync(command.script)) {
		return `Open Shell engine not found at ${command.script}. Run "npm run prepare:engine", or set OSHELL_ENGINE to openshell.py.`
	}
	return null
}

export function pythonConfigPath(userData: string): string {
	return join(userData, CONFIG)
}

export function readPythonChoice(userData: string): string | null {
	try {
		const parsed = JSON.parse(readFileSync(pythonConfigPath(userData), 'utf8')) as { python?: unknown }
		return typeof parsed.python === 'string' && parsed.python.length > 0 ? parsed.python : null
	} catch {
		return null
	}
}

// A GUI launch does not inherit the terminal PATH, so also look in the usual install locations.
export function pythonNames(platform: NodeJS.Platform): string[] {
	return platform === 'win32' ? ['python.exe', 'python3.exe'] : ['python3', 'python']
}

// `python3` is not always the newest install; Homebrew also ships `python3.14`.
export function isPythonExecutable(name: string, platform: NodeJS.Platform): boolean {
	if (platform === 'win32') return /^python(\d+(\.\d+)?)?\.exe$/i.test(name)
	return /^python(\d+(\.\d+)?)?$/.test(name)
}

export function pythonSearchDirs(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string[] {
	const home = env.HOME || env.USERPROFILE || homedir()
	const fromPath = (env.PATH ?? '').split(delimiter).filter(Boolean)
	const extra =
		platform === 'win32'
			? [
					join(env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'Programs', 'Python'),
					join(home, 'AppData', 'Local', 'Programs', 'Python')
				]
			: platform === 'darwin'
				? ['/usr/local/bin', '/opt/homebrew/bin', '/usr/bin', join(home, '.local', 'bin')]
				: ['/usr/local/bin', '/usr/bin', join(home, '.local', 'bin')]
	return [...new Set([...fromPath, ...extra])]
}

export function pythonVersion(executable: string): string | null {
	try {
		const out = execFileSync(executable, ['-c', 'import sys; print(sys.version.split()[0])'], {
			encoding: 'utf8',
			timeout: 4000,
			windowsHide: true,
			stdio: ['ignore', 'pipe', 'ignore']
		}).trim()
		return /^\d+\.\d+/.test(out) ? out : null
	} catch {
		return null
	}
}

export function describePython(path: string, source: PythonChoice['source'], version = pythonVersion(path)): PythonChoice | null {
	if (!version) return null
	const where = source === 'bundled' ? 'bundled' : source === 'default' ? 'default' : path
	return { path, version, label: `Python ${version}  ${where}`, source }
}
