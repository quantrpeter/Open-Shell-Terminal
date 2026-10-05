# Open Shell Terminal

A standalone GUI terminal for [Open Shell](../Open-Shell). Commands run in the Open Shell engine and their records show as sortable, filterable tables. A file explorer on the left follows the working directory, and clicking a folder runs `cd`.

## Develop

Needs Node 20+, Python 3.12+ and the `Open-Shell` checkout next to this folder.

```sh
npm install
npm run dev          # starts Electron with hot reload
```

The app finds the engine at `../Open-Shell/openshell.py` using `python3` (`python` on Windows). Override with `OSHELL_PYTHON` and `OSHELL_ENGINE`.

## Test

```sh
npm run typecheck
npm test             # unit tests and a real engine process
npm run test:e2e     # builds, then drives the Electron app with Playwright
```

## Package

```sh
npm run dist         # copies the engine, builds, runs electron-builder
```

Packaged builds ship a standalone Python 3.12 runtime. `npm run dist` downloads it for the current OS and CPU (`npm run fetch:python`), copies the engine, builds and runs electron-builder. Set `OSHELL_TARGET` (for example `win32-x64`) to fetch another platform's runtime. See [skills/1. plan.md](skills/1.%20plan.md) for status.

# Notes

if you reach this bug, run `node node_modules/electron/install.js`

![](/image/Screenshot%202026-10-06%20at%205.45.13 AM.png)
