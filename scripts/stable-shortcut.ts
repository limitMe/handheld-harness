import fs from 'node:fs'
import path from 'node:path'
import { createWindowsShortcuts } from './lib/shortcut'
import {
  APP_ICON_RELATIVE,
  SHORTCUT_NAME,
  STABLE_PROFILE,
  electronViteBin,
  isStableBuildPresent,
  isWorktreeRegistered,
  launcherDir,
  resolveStablePaths,
} from './lib/stable'

/** A launcher that sets the stable environment and runs the built app. */
function writeLauncher(stableDir: string, repoRoot: string): string {
  const dir = launcherDir()
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'stable-launch.cmd')
  const lines = [
    '@echo off',
    `title ${SHORTCUT_NAME}`,
    `cd /d "${stableDir}"`,
    `set "HANDHELD_PROFILE=${STABLE_PROFILE}"`,
    `set "HANDHELD_WORKSPACE=${repoRoot}"`,
    'set "HANDHELD_ENGINE_MODE=detached"',
    'set "HANDHELD_WINDOW=fullscreen"',
    `"${process.execPath}" "${electronViteBin(stableDir)}" preview --skipBuild`,
  ]
  fs.writeFileSync(file, lines.join('\r\n') + '\r\n', 'utf8')
  return file
}

/**
 * The app's own icon when the build carries it, otherwise the Electron binary, which is at
 * least a recognisable placeholder. Returns a path to a `.ico` or executable.
 */
function resolveShortcutIcon(stableDir: string): string | null {
  const candidates = [
    path.join(stableDir, APP_ICON_RELATIVE),
    path.join(stableDir, 'node_modules', 'electron', 'dist', 'electron.exe'),
  ]
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null
}

/**
 * Creates "HANDHELD.AI (stable)" shortcuts on the desktop and start menu.
 *
 * Usage: npm run stable:shortcut
 */
function main(): void {
  if (process.platform !== 'win32') {
    throw new Error('stable:shortcut only supports Windows')
  }

  const { repoRoot, stableDir } = resolveStablePaths()
  if (!isWorktreeRegistered(repoRoot, stableDir)) {
    throw new Error(`stable worktree missing at ${stableDir}; run "npm run stable:setup" first`)
  }
  if (!isStableBuildPresent(stableDir)) {
    throw new Error(
      `no stable build in ${stableDir}; run "npm run stable:setup" or "npm run stable:update" first`,
    )
  }

  const launcher = writeLauncher(stableDir, repoRoot)
  console.log(`launcher written to ${launcher}`)
  createWindowsShortcuts({
    name: SHORTCUT_NAME,
    launcher,
    workdir: stableDir,
    icon: resolveShortcutIcon(stableDir),
  })
  console.log(`shortcuts "${SHORTCUT_NAME}" created on the desktop and in the start menu`)
}

try {
  main()
} catch (error) {
  console.error(`stable:shortcut failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
