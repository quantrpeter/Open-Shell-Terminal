// Copies the Open Shell engine (openshell.py and its commands) next to the app
// so electron-builder can ship it as an extra resource.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = process.env.OSHELL_SOURCE ?? resolve(here, '..', '..', 'Open-Shell')
const target = resolve(here, '..', 'resources', 'engine')

if (!existsSync(join(source, 'openshell.py'))) {
	console.error(`openshell.py not found in ${source}. Set OSHELL_SOURCE to the Open-Shell checkout.`)
	process.exit(1)
}

rmSync(target, { recursive: true, force: true })
mkdirSync(target, { recursive: true })
cpSync(join(source, 'openshell.py'), join(target, 'openshell.py'))
cpSync(join(source, 'command'), join(target, 'command'), {
	recursive: true,
	filter: (path) => !path.includes('__pycache__')
})
console.log(`engine copied to ${target}`)
