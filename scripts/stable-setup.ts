import fs from 'node:fs'
import {
  MAIN_BRANCH,
  STABLE_BRANCH,
  buildStable,
  git,
  gitSucceeds,
  installStableDependencies,
  isWorktreeRegistered,
  resolveStablePaths,
} from './lib/stable'

/**
 * Creates the `stable` branch and worktree, installs dependencies and builds.
 *
 * Usage: npm run stable:setup
 */
function main(): void {
  const { repoRoot, stableDir } = resolveStablePaths()

  if (!gitSucceeds(['rev-parse', '--is-inside-work-tree'], repoRoot)) {
    throw new Error(`${repoRoot} is not a git repository`)
  }
  if (!gitSucceeds(['rev-parse', '--verify', '--quiet', `refs/heads/${MAIN_BRANCH}`], repoRoot)) {
    throw new Error(`branch "${MAIN_BRANCH}" not found in ${repoRoot}`)
  }

  if (!gitSucceeds(['rev-parse', '--verify', '--quiet', `refs/heads/${STABLE_BRANCH}`], repoRoot)) {
    console.log(`creating branch "${STABLE_BRANCH}" from "${MAIN_BRANCH}"`)
    git(['branch', STABLE_BRANCH, MAIN_BRANCH], repoRoot)
  }

  if (isWorktreeRegistered(repoRoot, stableDir)) {
    console.log(`worktree already registered at ${stableDir}`)
  } else {
    if (fs.existsSync(stableDir)) {
      throw new Error(
        `${stableDir} already exists but is not a registered worktree; move it away first`,
      )
    }
    console.log(`adding worktree at ${stableDir}`)
    git(['worktree', 'add', stableDir, STABLE_BRANCH], repoRoot)
  }

  console.log('installing stable dependencies (npm ci)')
  installStableDependencies(stableDir)

  console.log('building stable')
  buildStable(stableDir)

  console.log('')
  console.log(`Stable is ready at ${stableDir}`)
  console.log(
    'Start it with "npm run stable:start", or create shortcuts with "npm run stable:shortcut".',
  )
}

try {
  main()
} catch (error) {
  console.error(`stable:setup failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
