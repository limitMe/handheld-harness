import { spawnSync, type SpawnSyncOptions } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Repository root of the running script (`scripts/lib/` -> repo root). */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

export const MAIN_BRANCH = 'main'
export const STABLE_BRANCH = 'stable'
export const STABLE_DIR_ENV = 'HANDHELD_STABLE_DIR'

/** Build staging directory, swapped into `out/` only after a successful build. */
export const BUILD_TMP_DIR = '.stable-out-tmp'
export const BUILD_BACKUP_DIR = 'out.stable-backup'

export const STABLE_ENTRY_RELATIVE = path.join('out', 'main', 'index.js')
/** Multi-size Windows icon used by the desktop and start-menu shortcuts. */
export const APP_ICON_RELATIVE = path.join('resources', 'icons', 'handheld-harness.ico')
export const ELECTRON_VITE_RELATIVE = path.join(
  'node_modules',
  'electron-vite',
  'bin',
  'electron-vite.js',
)

export const STABLE_PROFILE = 'stable'
export const SHORTCUT_NAME = 'Handheld Harness (stable)'

export interface StablePaths {
  repoRoot: string
  stableDir: string
}

/** The stable worktree lives next to the main repository, e.g. `handheld-harness-stable`. */
export function resolveStableDir(repoRoot: string, override?: string): string {
  const trimmed = override?.trim()
  if (trimmed) return path.resolve(trimmed)
  return path.join(path.dirname(repoRoot), `${path.basename(repoRoot)}-stable`)
}

export function resolveStablePaths(repoRoot: string = REPO_ROOT): StablePaths {
  return { repoRoot, stableDir: resolveStableDir(repoRoot, process.env[STABLE_DIR_ENV]) }
}

export function formatStableTag(date: Date, index: number): string {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `stable-${year}${month}${day}-${index}`
}

export function nextStableTag(existing: readonly string[], date: Date): string {
  const taken = new Set(existing)
  let index = 1
  while (taken.has(formatStableTag(date, index))) index += 1
  return formatStableTag(date, index)
}

export interface ParsedStableTag {
  tag: string
  date: number
  index: number
}

export function parseStableTag(tag: string): ParsedStableTag | null {
  const match = /^stable-(\d{4})(\d{2})(\d{2})-(\d+)$/.exec(tag)
  if (!match) return null
  return {
    tag,
    date: Number(`${match[1]}${match[2]}${match[3]}`),
    index: Number(match[4]),
  }
}

/** Sorts `stable-*` tags newest-first, ignoring anything that does not match the pattern. */
export function sortStableTagsDesc(tags: readonly string[]): string[] {
  return tags
    .map(parseStableTag)
    .filter((parsed): parsed is ParsedStableTag => parsed !== null)
    .sort((a, b) => b.date - a.date || b.index - a.index)
    .map((parsed) => parsed.tag)
}

/**
 * Picks the tag to roll back to from a list sorted newest-first.
 * `current` is the tag the stable branch currently points at, if any.
 */
export function chooseRollbackTag(
  sortedDesc: readonly string[],
  current: string | null,
): string | null {
  if (sortedDesc.length === 0) return null
  if (current === null) return sortedDesc[0] ?? null
  const position = sortedDesc.indexOf(current)
  if (position < 0) return sortedDesc[0] ?? null
  return sortedDesc[position + 1] ?? null
}

export interface RunOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  allowFailure?: boolean
  quiet?: boolean
  shell?: boolean
}

function spawn(command: string, args: string[], options: RunOptions, extra: SpawnSyncOptions) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    shell: options.shell ?? false,
    ...extra,
  })
  if (result.error) throw result.error
  return result
}

export function run(command: string, args: string[], options: RunOptions = {}): void {
  const result = spawn(command, args, options, { stdio: options.quiet ? 'pipe' : 'inherit' })
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`command failed (${result.status ?? 'signal'}): ${command} ${args.join(' ')}`)
  }
}

export function capture(command: string, args: string[], options: RunOptions = {}): string {
  const result = spawn(command, args, options, { encoding: 'utf8' })
  if (result.status !== 0) {
    if (!options.allowFailure) {
      throw new Error(`command failed (${result.status ?? 'signal'}): ${command} ${args.join(' ')}`)
    }
    return ''
  }
  return String(result.stdout ?? '').trim()
}

export function runNpm(args: string[], options: RunOptions = {}): void {
  // Windows resolves npm through `npm.cmd`; Node refuses to spawn `.cmd` without a shell,
  // so run a single command string instead of passing args alongside `shell: true`.
  run(['npm', ...args].join(' '), [], { ...options, shell: true })
}

export function git(args: string[], cwd?: string): void {
  run('git', args, { cwd })
}

export function gitCapture(args: string[], cwd?: string): string {
  return capture('git', args, { cwd })
}

export function gitSucceeds(args: string[], cwd?: string): boolean {
  return spawnSync('git', args, { cwd, stdio: 'ignore' }).status === 0
}

export function isWorktreeRegistered(repoRoot: string, dir: string): boolean {
  const wanted = path.resolve(dir).toLowerCase()
  const output = gitCapture(['worktree', 'list', '--porcelain'], repoRoot)
  for (const line of output.split('\n')) {
    if (!line.startsWith('worktree ')) continue
    const value = line.slice('worktree '.length).trim()
    if (path.resolve(value).toLowerCase() === wanted) return true
  }
  return false
}

export function isStableBuildPresent(stableDir: string): boolean {
  return fs.existsSync(path.join(stableDir, STABLE_ENTRY_RELATIVE))
}

export function electronViteBin(stableDir: string): string {
  return path.join(stableDir, ELECTRON_VITE_RELATIVE)
}

/**
 * Electron 44 no longer ships a `postinstall` script, so `npm ci` does not fetch
 * the platform binary. Running `install.js` is idempotent and exits early when the
 * binary is already present.
 */
export function ensureElectronBinary(stableDir: string): void {
  const installScript = path.join(stableDir, 'node_modules', 'electron', 'install.js')
  if (!fs.existsSync(installScript)) return
  run(process.execPath, [installScript], { cwd: stableDir })
}

export function installStableDependencies(stableDir: string): void {
  runNpm(['ci'], { cwd: stableDir })
  ensureElectronBinary(stableDir)
}

export function launcherDir(): string {
  const base = process.env.LOCALAPPDATA ?? path.join(os.homedir(), '.handheld-harness')
  return path.join(base, 'handheld-harness')
}

/** Builds to a staging directory and only then swaps it into `out/`. */
export function buildStable(stableDir: string): void {
  const fresh = path.join(stableDir, BUILD_TMP_DIR)
  const target = path.join(stableDir, 'out')
  const backup = path.join(stableDir, BUILD_BACKUP_DIR)

  fs.rmSync(fresh, { recursive: true, force: true })
  fs.rmSync(backup, { recursive: true, force: true })

  try {
    runNpm(['run', 'build', '--', '--outDir', BUILD_TMP_DIR], { cwd: stableDir })
  } catch (error) {
    fs.rmSync(fresh, { recursive: true, force: true })
    throw error
  }

  let movedPrevious = false
  try {
    if (fs.existsSync(target)) {
      fs.renameSync(target, backup)
      movedPrevious = true
    }
    fs.renameSync(fresh, target)
  } catch (error) {
    if (movedPrevious && !fs.existsSync(target)) {
      try {
        fs.renameSync(backup, target)
      } catch {
        // Leave the backup directory in place; the operator can rename it manually.
      }
    }
    fs.rmSync(fresh, { recursive: true, force: true })
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `failed to swap the stable build (${message}); close the stable instance and retry`,
      { cause: error },
    )
  }

  if (movedPrevious) fs.rmSync(backup, { recursive: true, force: true })
}

export function currentStableTag(stableDir: string, tagsDesc: readonly string[]): string | null {
  const head = gitCapture(['rev-parse', 'HEAD'], stableDir)
  for (const tag of tagsDesc) {
    if (gitCapture(['rev-parse', `${tag}^{commit}`], stableDir) === head) return tag
  }
  return null
}
