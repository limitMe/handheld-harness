import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { OpenCodeEngine } from '../src/main/engine/opencode'
import { readPinnedSdkVersion } from '../src/main/engine/version'
import { runEngineContract } from '../tests/engine-contract'

/**
 * End-to-end smoke test that runs the real OpenCode server in `attached` mode
 * with a throwaway data directory, without starting Electron.
 *
 * Usage: npm run engine:smoke -- --engine opencode
 */

function parseArgs(argv: string[]): { engine: string; workspace: string } {
  let engine = 'opencode'
  let workspace = process.cwd()
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--engine' && argv[i + 1]) engine = argv[i + 1] as string
    if (argv[i] === '--workspace' && argv[i + 1]) workspace = path.resolve(argv[i + 1] as string)
  }
  return { engine, workspace }
}

function sdkVersion(): string {
  return readPinnedSdkVersion(process.cwd())
}

async function main(): Promise<void> {
  const { engine: engineName, workspace } = parseArgs(process.argv.slice(2))
  if (engineName !== 'opencode') {
    console.error(`engine:smoke only supports --engine opencode (got ${engineName})`)
    process.exitCode = 1
    return
  }

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'handheld-engine-smoke-'))
  const engine = new OpenCodeEngine({
    mode: 'attached',
    workspaceDir: workspace,
    serversDir: path.join(temp, 'servers'),
    logsDir: path.join(temp, 'logs'),
    sdkVersion: sdkVersion(),
    baseDir: process.cwd(),
    logger: {
      error: (message, meta) => console.error('[error]', message, meta ?? ''),
      warn: (message, meta) => console.warn('[warn]', message, meta ?? ''),
      info: (message, meta) => console.log('[info]', message, meta ?? ''),
      debug: () => undefined,
    },
  })

  const startedAt = Date.now()
  try {
    await engine.start()
    const snapshot = await engine.snapshot()
    if (snapshot.status.state !== 'ready') {
      throw new Error(`engine did not become ready: ${JSON.stringify(snapshot.status)}`)
    }
    console.log(
      `engine ready in ${Date.now() - startedAt} ms (pid ${snapshot.status.pid ?? 'n/a'})`,
    )

    await runEngineContract(engine, {
      timeoutMs: 120_000,
      onStep: (name, durationMs, detail) =>
        console.log(`  ✓ ${name} (${durationMs} ms)${detail ? ` ${detail}` : ''}`),
    })

    console.log(`smoke passed in ${Date.now() - startedAt} ms`)
  } finally {
    await engine.stop()
    fs.rmSync(temp, { recursive: true, force: true })
  }
}

main().catch((error: unknown) => {
  console.error('engine:smoke failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
