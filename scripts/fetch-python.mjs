// Downloads a standalone CPython (python-build-standalone) into resources/python
// so packaged builds do not depend on a system Python.
import { spawnSync } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'

const PYTHON_SERIES = process.env.OSHELL_PYTHON_SERIES ?? '3.12'
const here = dirname(fileURLToPath(import.meta.url))
const resources = resolve(here, '..', 'resources')
const target = join(resources, 'python')
const stamp = join(target, '.asset')

const TRIPLES = {
	'darwin-arm64': 'aarch64-apple-darwin',
	'darwin-x64': 'x86_64-apple-darwin',
	'linux-x64': 'x86_64-unknown-linux-gnu',
	'linux-arm64': 'aarch64-unknown-linux-gnu',
	'win32-x64': 'x86_64-pc-windows-msvc'
}

const key = process.env.OSHELL_TARGET ?? `${process.platform}-${process.arch}`
const triple = TRIPLES[key]
if (!triple) {
	console.error(`No standalone Python for ${key}. Supported: ${Object.keys(TRIPLES).join(', ')}.`)
	process.exit(1)
}

const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'open-shell-terminal' }
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`

const releaseUrl = process.env.OSHELL_PBS_TAG
	? `https://api.github.com/repos/astral-sh/python-build-standalone/releases/tags/${process.env.OSHELL_PBS_TAG}`
	: 'https://api.github.com/repos/astral-sh/python-build-standalone/releases/latest'

const release = await fetch(releaseUrl, { headers })
if (!release.ok) {
	console.error(`Cannot read ${releaseUrl}: HTTP ${release.status}`)
	process.exit(1)
}
const { assets } = await release.json()
const pattern = new RegExp(`^cpython-${PYTHON_SERIES.replace('.', '\\.')}\\.\\d+\\+\\d+-${triple}-install_only_stripped\\.tar\\.gz$`)
const asset = assets.find((item) => pattern.test(item.name))
if (!asset) {
	console.error(`No ${PYTHON_SERIES} ${triple} install_only_stripped asset in that release.`)
	process.exit(1)
}

const executable = process.platform === 'win32' ? join(target, 'python.exe') : join(target, 'bin', 'python3')
if (existsSync(executable) && existsSync(stamp) && readFileSync(stamp, 'utf8') === asset.name) {
	console.log(`Python already present: ${asset.name}`)
	process.exit(0)
}

const archive = join(tmpdir(), asset.name)
console.log(`Downloading ${asset.name} (${Math.round(asset.size / 1e6)} MB)`)
const download = await fetch(asset.browser_download_url, { headers: { 'User-Agent': headers['User-Agent'] } })
if (!download.ok || !download.body) {
	console.error(`Download failed: HTTP ${download.status}`)
	process.exit(1)
}
await pipeline(Readable.fromWeb(download.body), createWriteStream(archive))

rmSync(target, { recursive: true, force: true })
mkdirSync(resources, { recursive: true })
const extract = spawnSync('tar', ['-xzf', archive, '-C', resources], { stdio: 'inherit' })
rmSync(archive, { force: true })
if (extract.status !== 0) {
	console.error('tar failed to extract the archive')
	process.exit(1)
}
writeFileSync(stamp, asset.name)

if (key === `${process.platform}-${process.arch}`) {
	const check = spawnSync(executable, ['--version'], { encoding: 'utf8' })
	if (check.status !== 0) {
		console.error(`The extracted Python does not run: ${check.stderr}`)
		process.exit(1)
	}
	console.log(`Installed ${check.stdout.trim()} in ${target}`)
} else {
	console.log(`Installed ${asset.name} in ${target}`)
}
