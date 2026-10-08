import fs from 'node:fs'
import path from 'node:path'
import { createWindowsShortcuts } from './lib/shortcut'
import { APP_ICON_RELATIVE, REPO_ROOT, launcherDir } from './lib/stable'

const SHORTCUT_NAME = 'HANDHELD.AI (dev)'

/** A launcher that runs the electron-vite dev server (HMR) from the repository root. */
function writeLauncher(repoRoot: string): string {
  const dir = launcherDir()
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'dev-launch.cmd')
  const lines = [
    '@echo off',
    `title ${SHORTCUT_NAME}`,
    `cd /d "${repoRoot}"`,
    'set "HANDHELD_PROFILE=dev"',
    `set "HANDHELD_WORKSPACE=${repoRoot}"`,
    'call npm run dev',
  ]
  fs.writeFileSync(file, lines.join('\r\n') + '\r\n', 'utf8')
  return file
}

function resolveShortcutIcon(repoRoot: string): string | null {
  const candidates = [
    path.join(repoRoot, APP_ICON_RELATIVE),
    path.join(repoRoot, 'node_modules', 'electron', 'dist', 'electron.exe'),
  ]
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null
}

/**
 * Creates "HANDHELD.AI (dev)" shortcuts on the desktop and start menu; they run
 * the development instance with HMR from this repository.
 *
 * Usage: npm run dev:shortcut
 */
function main(): void {
  if (process.platform !== 'win32') {
    throw new Error('dev:shortcut only supports Windows')
  }
  if (!fs.existsSync(path.join(REPO_ROOT, 'electron.vite.config.ts'))) {
    throw new Error(`dev shortcut expects the repository at ${REPO_ROOT}`)
  }

  const launcher = writeLauncher(REPO_ROOT)
  console.log(`launcher written to ${launcher}`)
  createWindowsShortcuts({
    name: SHORTCUT_NAME,
    launcher,
    workdir: REPO_ROOT,
    icon: resolveShortcutIcon(REPO_ROOT),
  })
  console.log(`shortcuts "${SHORTCUT_NAME}" created on the desktop and in the start menu`)
}

try {
  main()
} catch (error) {
  console.error(`dev:shortcut failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
