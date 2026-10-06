import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { OpencodeClient } from '@opencode-ai/sdk/v2'
import { acquireServer, killServer, randomPassword } from '../src/main/engine/host'
import { resolveBinary } from '../src/main/engine/binary'
import { readPinnedSdkVersion } from '../src/main/engine/version'
import { silentLogger } from '../src/main/engine/logger'

/**
 * Records the raw SSE event stream for a tool call that requires permission.
 *
 * Usage: npm run engine:record
 *
 * The fixture is consumed by the normalizer unit tests. Re-run this whenever
 * the locked OpenCode version is upgraded.
 */

const FIXTURE_DIR = path.join(process.cwd(), 'tests', 'fixtures', 'opencode')
const VERSION = readPinnedSdkVersion(process.cwd())

function sanitizeValue(value: unknown, replacements: Array<[string, string]>): unknown {
  if (typeof value === 'string') {
    let result = value
    for (const [from, to] of replacements) {
      if (!from) continue
      result = result.split(from).join(to)
      result = result.split(from.replace(/\\/g, '/')).join(to)
    }
    return result
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, replacements))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = sanitizeValue(item, replacements)
    }
    return out
  }
  return value
}

async function main(): Promise<void> {
  const workspaceDir = process.cwd()
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'handheld-engine-record-'))
  const binaryPath = resolveBinary({
    env: process.env,
    platform: process.platform,
    arch: process.arch,
    baseDir: process.cwd(),
  }).path
  const password = randomPassword()

  const handle = await acquireServer({
    mode: 'attached',
    binaryPath,
    workspaceDir,
    version: VERSION,
    logsDir: path.join(temp, 'logs'),
    serversDir: path.join(temp, 'servers'),
    password,
    configContent: JSON.stringify({ permission: { bash: 'ask' } }),
    logger: silentLogger,
  })

  const { createOpencodeClient } = await import('@opencode-ai/sdk/v2')
  const client: OpencodeClient = createOpencodeClient({
    baseUrl: handle.url,
    headers: {
      Authorization: `Basic ${Buffer.from(`opencode:${handle.password}`).toString('base64')}`,
    },
  })

  try {
    const created = await client.session.create({ title: 'record-basic-tool-permission' })
    const sessionId = (created.data as { id: string }).id

    const events: unknown[] = []
    const controller = new AbortController()
    const subscription = await client.event.subscribe({}, { signal: controller.signal })

    const consumer = (async () => {
      for await (const event of subscription.stream) {
        events.push(event)
        const type = (event as { type?: string }).type
        const properties = (event as { properties?: Record<string, unknown> }).properties ?? {}
        if (type === 'permission.asked') {
          await client.permission.reply({ requestID: String(properties.id), reply: 'once' })
        }
        if (type === 'session.idle' && properties.sessionID === sessionId) return
      }
    })()

    await client.session.promptAsync({
      sessionID: sessionId,
      parts: [
        { type: 'text', text: 'Run the shell command `node -v` and then reply with exactly: DONE' },
      ],
    })

    await Promise.race([consumer, new Promise((resolve) => setTimeout(resolve, 120_000))])
    controller.abort()

    const replacements: Array<[string, string]> = [
      [workspaceDir, '<WORKSPACE>'],
      [os.homedir(), '<HOME>'],
      [os.tmpdir(), '<TEMP>'],
      [os.userInfo().username, '<USER>'],
      [password, '<PASSWORD>'],
    ]
    const outputDir = path.join(FIXTURE_DIR, VERSION)
    fs.mkdirSync(outputDir, { recursive: true })
    const lines = events.map((event) => JSON.stringify(sanitizeValue(event, replacements)))
    fs.writeFileSync(
      path.join(outputDir, 'basic-tool-permission.jsonl'),
      `${lines.join('\n')}\n`,
      'utf8',
    )
    console.log(
      `recorded ${events.length} events to ${path.relative(process.cwd(), outputDir)}/basic-tool-permission.jsonl`,
    )
  } finally {
    killServer(handle, { serversDir: path.join(temp, 'servers'), logger: silentLogger })
    fs.rmSync(temp, { recursive: true, force: true })
  }
}

main().catch((error: unknown) => {
  console.error('engine:record failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
