import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import {
  STABLE_PROFILE,
  electronViteBin,
  isStableBuildPresent,
  isWorktreeRegistered,
  resolveStablePaths,
} from './lib/stable'

/**
 * Runs the built stable instance fullscreen, sharing the OpenCode server with
 * the development instance.
 *
 * Usage: npm run stable:start
 */
function main(): void {
  const { repoRoot, stableDir } = resolveStablePaths()

  if (!isWorktreeRegistered(repoRoot, stableDir)) {
    throw new Error(`stable worktree missing at ${stableDir}; run "npm run stable:setup" first`)
  }
  if (!isStableBuildPresent(stableDir)) {
    throw new Error(
      `no stable build in ${stableDir}; run "npm run stable:setup" or "npm run stable:update" first`,
    )
  }

  const bin = electronViteBin(stableDir)
  if (!fs.existsSync(bin)) {
    throw new Error(`electron-vite is not installed in ${stableDir}; run "npm ci" there`)
  }

  const env = {
    ...process.env,
    HANDHELD_PROFILE: STABLE_PROFILE,
    HANDHELD_WORKSPACE: repoRoot,
    HANDHELD_ENGINE_MODE: 'detached',
    HANDHELD_WINDOW: 'fullscreen',
  } as Record<string, string | undefined>
  delete env.ELECTRON_RENDERER_URL

  const result = spawnSync(process.execPath, [bin, 'preview', '--skipBuild'], {
    cwd: stableDir,
    env,
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
}

try {
  main()
} catch (error) {
  console.error(`stable:start failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
