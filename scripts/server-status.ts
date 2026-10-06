import { isServerHealthy, listRegistries } from '../src/main/engine/server-registry'
import { serversDir } from './lib/paths'

/** Usage: npm run server:status */
async function main(): Promise<void> {
  const entries = listRegistries(serversDir())
  if (entries.length === 0) {
    console.log('No registered OpenCode servers.')
    return
  }
  for (const { engineKind, entry } of entries) {
    const healthy = await isServerHealthy(entry.url, entry.password)
    console.log(
      [
        `engine=${engineKind}`,
        `pid=${entry.pid}`,
        `healthy=${healthy ? 'yes' : 'no'}`,
        `url=${entry.url}`,
        `version=${entry.version}`,
        `workspace=${entry.workspaceDir}`,
        `startedAt=${new Date(entry.startedAt).toISOString()}`,
      ].join('  '),
    )
  }
}

main().catch((error: unknown) => {
  console.error('server:status failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
