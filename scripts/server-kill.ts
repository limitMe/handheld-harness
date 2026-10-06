import { killProcessTree } from '../src/main/engine/host'
import {
  isPidListeningOnPort,
  listRegistries,
  normalizeWorkspaceDir,
  portFromUrl,
} from '../src/main/engine/server-registry'
import { serversDir } from './lib/paths'

/**
 * Kills registered OpenCode servers **without** removing their registry files.
 * Use this to simulate a crash for the engine's recovery behaviour; the app
 * will detect the dead pid and start a fresh server.
 *
 * Prefer this over `Stop-Process -Name opencode`, which also matches the
 * unrelated OpenCode desktop app (`OpenCode.exe`).
 *
 * Usage:
 *   npm run server:kill -- <workspaceDir>
 *   npm run server:kill -- --all
 */

const USAGE = [
  'Usage:',
  '  npm run server:kill -- <workspaceDir>',
  '  npm run server:kill -- --all',
].join('\n')

function main(): void {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    console.log(USAGE)
    return
  }

  const targetAll = args.includes('--all')
  const workspace = args.find((arg) => !arg.startsWith('--'))
  if (!targetAll && !workspace) {
    console.log(USAGE)
    return
  }

  const normalized = workspace ? normalizeWorkspaceDir(workspace) : undefined
  const targets = listRegistries(serversDir()).filter(
    ({ entry }) => targetAll || normalizeWorkspaceDir(entry.workspaceDir) === normalized,
  )
  if (targets.length === 0) {
    console.log('No matching OpenCode servers.')
    return
  }

  for (const { entry } of targets) {
    const ownsPort = isPidListeningOnPort(entry.pid, portFromUrl(entry.url))
    if (ownsPort === false) {
      console.warn(`skip killing pid=${entry.pid}: it no longer owns ${entry.url} (pid was reused)`)
      continue
    }
    killProcessTree(entry.pid)
    console.log(
      `killed pid=${entry.pid} workspace=${entry.workspaceDir} (registry kept for recovery test)`,
    )
  }
}

main()
