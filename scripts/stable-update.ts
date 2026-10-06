import {
  MAIN_BRANCH,
  buildStable,
  git,
  gitCapture,
  installStableDependencies,
  isWorktreeRegistered,
  nextStableTag,
  resolveStablePaths,
  runNpm,
} from './lib/stable'

/**
 * Fast-forwards `stable` to `main`, tags the release, installs dependencies when
 * the lockfile changed and rebuilds.
 *
 * Usage: npm run stable:update
 */
function main(): void {
  const { repoRoot, stableDir } = resolveStablePaths()

  if (!isWorktreeRegistered(repoRoot, stableDir)) {
    throw new Error(`stable worktree missing at ${stableDir}; run "npm run stable:setup" first`)
  }

  const dirty = gitCapture(['status', '--porcelain'], repoRoot)
  if (dirty) {
    throw new Error(`main worktree is not clean; commit or stash first:\n${dirty}`)
  }

  console.log('running "npm run check" in the main repository')
  runNpm(['run', 'check'], { cwd: repoRoot })

  const target = gitCapture(['rev-parse', `refs/heads/${MAIN_BRANCH}`], repoRoot)
  const before = gitCapture(['rev-parse', 'refs/heads/stable'], repoRoot)
  if (before === target) {
    console.log(`stable already matches ${MAIN_BRANCH} (${target.slice(0, 7)}); nothing to update`)
    return
  }

  console.log(`fast-forwarding stable ${before.slice(0, 7)} -> ${target.slice(0, 7)}`)
  git(['merge', '--ff-only', target], stableDir)

  const tags = gitCapture(['tag', '-l', 'stable-*'], repoRoot).split('\n').filter(Boolean)
  const tag = nextStableTag(tags, new Date())
  git(['tag', tag, target], repoRoot)
  console.log(`tagged ${tag}`)

  const lockChanged =
    gitCapture(['diff', '--name-only', before, target, '--', 'package-lock.json'], repoRoot)
      .length > 0
  if (lockChanged) {
    console.log('package-lock.json changed; running npm ci')
    installStableDependencies(stableDir)
  }

  console.log('building stable')
  buildStable(stableDir)

  console.log('')
  console.log(`Stable updated (${tag}). Restart the stable instance to use it.`)
}

try {
  main()
} catch (error) {
  console.error(`stable:update failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
