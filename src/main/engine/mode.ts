import path from 'node:path'
import type { EngineMode } from '../../shared/engine'

export const ENGINE_MODES: readonly EngineMode[] = ['attached', 'detached', 'external', 'fake']

/** `HANDHELD_ENGINE_MODE` wins; otherwise dev defaults to detached, builds to attached. */
export function resolveEngineMode(env: NodeJS.ProcessEnv, isDev: boolean): EngineMode {
  const raw = env.HANDHELD_ENGINE_MODE?.trim()
  if (raw && (ENGINE_MODES as readonly string[]).includes(raw)) return raw as EngineMode
  return isDev ? 'detached' : 'attached'
}

export interface WorkspaceResolution {
  dir?: string
  /** Where the value came from, for logging and the "engine down" hint. */
  source: 'settings' | 'env' | 'dev-default' | 'release-default' | 'none'
}

/**
 * Workspace priority (spec 02 section 4):
 * 1. settings.engine.workspaceDir
 * 2. HANDHELD_WORKSPACE
 * 3. the repository root in development (needed for dogfooding)
 * 4. a user-writable default in packaged builds (spec 19; the OS documents
 *    folder, matching OpenCode's own default)
 * 5. none -> the engine reports `down` with a configuration hint
 */
export function resolveWorkspaceDir(input: {
  settingsWorkspace?: string
  env: NodeJS.ProcessEnv
  isDev: boolean
  repositoryRoot: string
  /** User-writable fallback for packaged builds; absent means no default. */
  defaultWorkspaceDir?: string
}): WorkspaceResolution {
  const fromSettings = input.settingsWorkspace?.trim()
  if (fromSettings) return { dir: path.resolve(fromSettings), source: 'settings' }

  const fromEnv = input.env.HANDHELD_WORKSPACE?.trim()
  if (fromEnv) return { dir: path.resolve(fromEnv), source: 'env' }

  if (input.isDev) return { dir: path.resolve(input.repositoryRoot), source: 'dev-default' }

  const fromDefault = input.defaultWorkspaceDir?.trim()
  if (fromDefault) return { dir: path.resolve(fromDefault), source: 'release-default' }

  return { source: 'none' }
}
