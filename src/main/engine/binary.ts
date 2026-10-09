import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

/**
 * Locates the OpenCode platform binary. The lookup order follows spec 02
 * section 2. It is pure apart from the injected filesystem lookups so it can be
 * unit-tested without a real installation.
 */

export interface BinaryLookup {
  existsSync: (candidate: string) => boolean
  /** Resolves the directory of an installed npm package, or undefined when absent. */
  resolvePackageDir: (name: string) => string | undefined
}

export interface ResolveBinaryOptions {
  env: NodeJS.ProcessEnv
  platform: NodeJS.Platform
  arch: string
  /** Root used to resolve node_modules packages (project root / app path). */
  baseDir: string
  /**
   * Electron's `process.resourcesPath`; set in packaged builds so the bundled
   * OpenCode binary (`extraResources`, spec 19) can be found.
   */
  resourcesDir?: string
  existsSync?: (candidate: string) => boolean
  resolvePackageDir?: (name: string) => string | undefined
}

export interface BinaryResolution {
  path: string
  /** Human-readable description of where it was found, for logging. */
  source: string
}

const BINARY_NAME = process.platform === 'win32' ? 'opencode.exe' : 'opencode'

export function platformPackageNames(platform: NodeJS.Platform, arch: string): string[] {
  if (platform === 'win32') {
    if (arch === 'arm64') return ['opencode-windows-arm64', 'opencode-windows-arm64-baseline']
    return ['opencode-windows-x64', 'opencode-windows-x64-baseline']
  }
  if (platform === 'darwin') {
    return arch === 'arm64'
      ? ['opencode-darwin-arm64']
      : ['opencode-darwin-x64', 'opencode-darwin-x64-baseline']
  }
  if (arch === 'arm64') return ['opencode-linux-arm64', 'opencode-linux-arm64-musl']
  return [
    'opencode-linux-x64',
    'opencode-linux-x64-baseline',
    'opencode-linux-x64-musl',
    'opencode-linux-x64-baseline-musl',
  ]
}

function defaultLookup(baseDir: string): BinaryLookup {
  const require = createRequire(path.join(baseDir, 'package.json'))
  return {
    existsSync: (candidate) => fs.existsSync(candidate),
    resolvePackageDir: (name) => {
      try {
        return path.dirname(require.resolve(`${name}/package.json`))
      } catch {
        return undefined
      }
    },
  }
}

export function resolveBinary(options: ResolveBinaryOptions): BinaryResolution {
  const lookup: BinaryLookup = {
    existsSync: options.existsSync ?? fs.existsSync,
    resolvePackageDir:
      options.resolvePackageDir ?? defaultLookup(options.baseDir).resolvePackageDir,
  }

  const decisions: string[] = []

  const explicit = options.env.HANDHELD_OPENCODE_BIN?.trim()
  if (explicit) {
    if (lookup.existsSync(explicit)) {
      return { path: explicit, source: 'HANDHELD_OPENCODE_BIN' }
    }
    decisions.push(`HANDHELD_OPENCODE_BIN=${explicit} (not found)`)
  } else {
    decisions.push('HANDHELD_OPENCODE_BIN (unset)')
  }

  for (const name of platformPackageNames(options.platform, options.arch)) {
    const dir = lookup.resolvePackageDir(name)
    if (!dir) {
      decisions.push(`node_modules/${name} (not installed)`)
      continue
    }
    const candidate = path.join(dir, 'bin', BINARY_NAME)
    if (lookup.existsSync(candidate)) {
      return { path: candidate, source: `node_modules/${name}` }
    }
    decisions.push(`node_modules/${name}/bin/${BINARY_NAME} (missing)`)
  }

  const wrapperDir = lookup.resolvePackageDir('opencode-ai')
  if (wrapperDir) {
    const candidate = path.join(wrapperDir, 'bin', BINARY_NAME)
    if (lookup.existsSync(candidate)) {
      return { path: candidate, source: 'node_modules/opencode-ai' }
    }
    decisions.push(`node_modules/opencode-ai/bin/${BINARY_NAME} (missing)`)
  } else {
    decisions.push('node_modules/opencode-ai (not installed)')
  }

  if (options.resourcesDir) {
    const candidate = path.join(options.resourcesDir, 'opencode', BINARY_NAME)
    if (lookup.existsSync(candidate)) {
      return { path: candidate, source: 'bundled resources' }
    }
    decisions.push(`resources/opencode/${BINARY_NAME} (missing)`)
  }

  if (options.env.HANDHELD_OPENCODE_ALLOW_PATH === '1') {
    const pathEntries = (options.env.PATH ?? '').split(path.delimiter).filter(Boolean)
    for (const entry of pathEntries) {
      const candidate = path.join(entry, BINARY_NAME)
      if (lookup.existsSync(candidate)) {
        return { path: candidate, source: 'PATH (HANDHELD_OPENCODE_ALLOW_PATH=1)' }
      }
    }
    decisions.push('PATH (HANDHELD_OPENCODE_ALLOW_PATH=1, not found)')
  } else {
    decisions.push('PATH (disabled; set HANDHELD_OPENCODE_ALLOW_PATH=1 to allow)')
  }

  throw new Error(
    `Could not locate the OpenCode binary. Checked:\n${decisions.map((d) => `  - ${d}`).join('\n')}`,
  )
}
