import fs from 'node:fs'
import { killProcessTree } from '../src/main/engine/host'
import {
  deleteRegistry,
  isPidListeningOnPort,
  listRegistries,
  normalizeWorkspaceDir,
  portFromUrl,
} from '../src/main/engine/server-registry'
import { serversDir } from './lib/paths'

/**
 * Stops registered OpenCode servers and removes their registry files.
 *
 * Usage:
 *   npm run server:stop -- <workspaceDir>
 *   npm run server:stop -- --all
 */

const USAGE = [
  'Usage:',
  '  npm run server:stop -- <workspaceDir>',
  '  npm run server:stop -- --all',
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

  const entries = listRegistries(serversDir())
  const normalized = workspace ? normalizeWorkspaceDir(workspace) : undefined
  const targets = entries.filter(
    ({ entry }) => targetAll || normalizeWorkspaceDir(entry.workspaceDir) === normalized,
  )

  if (targets.length === 0) {
    console.log('No matching OpenCode servers.')
    return
  }

  for (const { file, entry } of targets) {
    const ownsPort = isPidListeningOnPort(entry.pid, portFromUrl(entry.url))
    if (ownsPort === false) {
      console.warn(
        `skip killing pid=${entry.pid}: it no longer owns ${entry.url} (pid was reused); removing registry entry only`,
      )
    } else {
      killProcessTree(entry.pid)
    }
    deleteRegistry(file)
    fs.rmSync(file.replace(/\.json$/, '.models.json'), { force: true })
    console.log(`stopped pid=${entry.pid} workspace=${entry.workspaceDir}`)
  }
  console.log(
    `stopped ${targets.length} server(s) (key(s): ${targets.map((target) => target.key).join(', ')})`,
  )
}

main()
