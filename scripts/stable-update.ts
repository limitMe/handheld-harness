import {
  MAIN_BRANCH,
  buildStable,
  git,
  gitCapture,
  hasStableTagAt,
  installStableDependencies,
  isStableDependenciesHealthy,
  isWorktreeRegistered,
  nextStableTag,
  readBuildCommit,
  resolveStablePaths,
  runNpm,
} from './lib/stable'

/**
 * Fast-forwards `stable` to `main`, installs dependencies when the lockfile
 * changed, rebuilds and only then tags the result.
 *
 * Every step is idempotent: if a previous run advanced `stable` but failed to
 * install or build, re-running finishes the job instead of reporting "nothing to
 * update" against a stale `out/`.
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
  const advanced = before !== target
  const depsHealthy = isStableDependenciesHealthy(stableDir)
  const buildCurrent = readBuildCommit(stableDir) === target
  const isTagged = hasStableTagAt(repoRoot, target)

  if (!advanced && depsHealthy && buildCurrent && isTagged) {
    console.log(
      `stable already matches ${MAIN_BRANCH} (${target.slice(0, 7)}) and is up to date; nothing to update`,
    )
    return
  }

  if (advanced) {
    console.log(`fast-forwarding stable ${before.slice(0, 7)} -> ${target.slice(0, 7)}`)
    git(['merge', '--ff-only', target], stableDir)
  } else {
    console.log(`stable already matches ${MAIN_BRANCH} (${target.slice(0, 7)}); finishing the update`)
  }

  const lockChanged =
    advanced &&
    gitCapture(['diff', '--name-only', before, target, '--', 'package-lock.json'], repoRoot)
      .length > 0
  if (lockChanged) {
    console.log('package-lock.json changed; running npm ci')
    installStableDependencies(stableDir)
  } else if (!depsHealthy) {
    console.log('stable dependencies are missing or incomplete; running npm ci')
    installStableDependencies(stableDir)
  }

  if (advanced || !buildCurrent) {
    console.log('building stable')
    buildStable(stableDir)
  } else {
    console.log('stable build already matches the target; skipping rebuild')
  }

  if (!isTagged) {
    const tags = gitCapture(['tag', '-l', 'stable-*'], repoRoot).split('\n').filter(Boolean)
    const tag = nextStableTag(tags, new Date())
    git(['tag', tag, target], repoRoot)
    console.log(`tagged ${tag}`)
  }

  console.log('')
  console.log('Stable updated. Restart the stable instance to use it.')
}

try {
  main()
} catch (error) {
  console.error(`stable:update failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
