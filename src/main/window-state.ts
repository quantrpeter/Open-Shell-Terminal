import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BrowserWindow, Rectangle, Screen } from 'electron'

export interface WindowState {
	x: number
	y: number
	width: number
	height: number
	maximized: boolean
}

export const DEFAULT_WINDOW = { width: 1360, height: 860 }
const FILE = 'window.json'
const MIN_VISIBLE = 80

export function windowStatePath(userData: string): string {
	return join(userData, FILE)
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value)
}

export function readWindowState(userData: string): WindowState | null {
	try {
		const parsed = JSON.parse(readFileSync(windowStatePath(userData), 'utf8')) as Partial<WindowState>
		if (!isFiniteNumber(parsed.x) || !isFiniteNumber(parsed.y)) return null
		if (!isFiniteNumber(parsed.width) || !isFiniteNumber(parsed.height)) return null
		if (parsed.width < 1 || parsed.height < 1) return null
		return {
			x: parsed.x,
			y: parsed.y,
			width: parsed.width,
			height: parsed.height,
			maximized: parsed.maximized === true
		}
	} catch {
		return null
	}
}

// A saved frame from a disconnected display would open off-screen. Keep it only
// when enough of the title bar still lands on a current display.
export function visibleWindowState(state: WindowState | null, screen: Screen): WindowState | null {
	if (!state) return null
	const displays = screen.getAllDisplays()
	const title = { x: state.x, y: state.y, width: Math.min(state.width, 240), height: MIN_VISIBLE }
	const onScreen = displays.some((display) => intersects(display.workArea, title))
	return onScreen ? state : null
}

function intersects(a: Rectangle, b: Rectangle): boolean {
	return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

export function writeWindowState(userData: string, state: WindowState): void {
	writeFileSync(windowStatePath(userData), JSON.stringify(state))
}

// Normal bounds, not the maximized frame, so the next restore can un-maximize.
export function captureWindowState(window: BrowserWindow): WindowState {
	const bounds = window.isMaximized() ? window.getNormalBounds() : window.getBounds()
	return { ...bounds, maximized: window.isMaximized() }
}
