import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  SHORTCUT_NAME,
  STABLE_PROFILE,
  electronViteBin,
  isStableBuildPresent,
  isWorktreeRegistered,
  launcherDir,
  resolveStablePaths,
} from './lib/stable'

function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function resolvePowerShell(): string {
  const pwsh = spawnSync('pwsh', ['-NoProfile', '-Command', '$true'], { stdio: 'ignore' })
  return pwsh.status === 0 ? 'pwsh' : 'powershell.exe'
}

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

function createShortcuts(stableDir: string, launcher: string): void {
  const electronExe = path.join(stableDir, 'node_modules', 'electron', 'dist', 'electron.exe')
  const iconLine = fs.existsSync(electronExe)
    ? `  $link.IconLocation = ${psQuote(electronExe)} + ',0'`
    : null

  const script = [
    "$ErrorActionPreference = 'Stop'",
    '$ws = New-Object -ComObject WScript.Shell',
    `$launcher = ${psQuote(launcher)}`,
    `$name = ${psQuote(`${SHORTCUT_NAME}.lnk`)}`,
    `$workdir = ${psQuote(stableDir)}`,
    '$targets = @(',
    "  (Join-Path ([Environment]::GetFolderPath('Desktop')) $name),",
    "  (Join-Path ([Environment]::GetFolderPath('Programs')) $name)",
    ')',
    'foreach ($target in $targets) {',
    '  $link = $ws.CreateShortcut($target)',
    '  $link.TargetPath = $env:ComSpec',
    "  $link.Arguments = '/c \"' + $launcher + '\"'",
    '  $link.WorkingDirectory = $workdir',
    `  $link.Description = ${psQuote(SHORTCUT_NAME)}`,
    ...(iconLine ? [iconLine] : []),
    '  $link.Save()',
    '  Write-Output ("created " + $target)',
    '}',
  ].join('\r\n')

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'handheld-stable-'))
  const tmpScript = path.join(tmpDir, 'shortcut.ps1')
  fs.writeFileSync(tmpScript, script + '\r\n', 'utf8')
  try {
    const result = spawnSync(
      resolvePowerShell(),
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tmpScript],
      { stdio: 'inherit' },
    )
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(`PowerShell exited with code ${result.status}`)
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
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
  createShortcuts(stableDir, launcher)
  console.log(`shortcuts "${SHORTCUT_NAME}" created on the desktop and in the start menu`)
}

try {
  main()
} catch (error) {
  console.error(`stable:shortcut failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
