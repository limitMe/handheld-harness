import {
  buildStable,
  chooseRollbackTag,
  currentStableTag,
  git,
  gitCapture,
  installStableDependencies,
  isWorktreeRegistered,
  resolveStablePaths,
  sortStableTagsDesc,
} from './lib/stable'

/**
 * Moves `stable` back to the previous `stable-*` tag and rebuilds.
 *
 * Usage: npm run stable:rollback
 */
function main(): void {
  const { repoRoot, stableDir } = resolveStablePaths()

  if (!isWorktreeRegistered(repoRoot, stableDir)) {
    throw new Error(`stable worktree missing at ${stableDir}; run "npm run stable:setup" first`)
  }

  const tags = sortStableTagsDesc(
    gitCapture(['tag', '-l', 'stable-*'], repoRoot).split('\n').filter(Boolean),
  )
  if (tags.length === 0) {
    throw new Error('no stable-* tags found; there is nothing to roll back to')
  }

  const currentTag = currentStableTag(stableDir, tags)
  const target = chooseRollbackTag(tags, currentTag)
  if (!target) {
    throw new Error(`no stable-* tag older than ${currentTag ?? 'HEAD'}; nothing to roll back to`)
  }

  const before = gitCapture(['rev-parse', 'refs/heads/stable'], repoRoot)
  console.log(`rolling stable ${before.slice(0, 7)} -> ${target}`)
  git(['reset', '--hard', target], stableDir)

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
  console.log(`Stable rolled back to ${target}. Restart the stable instance to use it.`)
}

try {
  main()
} catch (error) {
  console.error(`stable:rollback failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
