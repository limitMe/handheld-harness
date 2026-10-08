import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function resolvePowerShell(): string {
  const pwsh = spawnSync('pwsh', ['-NoProfile', '-Command', '$true'], { stdio: 'ignore' })
  return pwsh.status === 0 ? 'pwsh' : 'powershell.exe'
}

export interface WindowsShortcut {
  /** Shortcut file name without the `.lnk` suffix. */
  name: string
  /** `.cmd` launcher the shortcut runs through `%ComSpec%`. */
  launcher: string
  workdir: string
  /** `.ico` or executable used as the icon; omitted when `null`. */
  icon: string | null
}

/** Creates `<name>.lnk` on the desktop and in the Start menu. */
export function createWindowsShortcuts({ name, launcher, workdir, icon }: WindowsShortcut): void {
  const iconLine = icon ? `  $link.IconLocation = ${psQuote(icon)} + ',0'` : null

  const script = [
    "$ErrorActionPreference = 'Stop'",
    '$ws = New-Object -ComObject WScript.Shell',
    `$launcher = ${psQuote(launcher)}`,
    `$name = ${psQuote(`${name}.lnk`)}`,
    `$workdir = ${psQuote(workdir)}`,
    '$targets = @(',
    "  (Join-Path ([Environment]::GetFolderPath('Desktop')) $name),",
    "  (Join-Path ([Environment]::GetFolderPath('Programs')) $name)",
    ')',
    'foreach ($target in $targets) {',
    '  $link = $ws.CreateShortcut($target)',
    '  $link.TargetPath = $env:ComSpec',
    "  $link.Arguments = '/c \"' + $launcher + '\"'",
    '  $link.WorkingDirectory = $workdir',
    `  $link.Description = ${psQuote(name)}`,
    ...(iconLine ? [iconLine] : []),
    '  $link.Save()',
    '  Write-Output ("created " + $target)',
    '}',
  ].join('\r\n')

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'handheld-shortcut-'))
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
