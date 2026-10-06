import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

/**
 * Registry of running OpenCode servers. Files live under
 * `<appData>/handheld-ai/servers/<engineKind>/<key>.json` and are intentionally
 * not profile-scoped: two profiles sharing a workspace and a version reuse one
 * server so they see the same sessions.
 */

export interface ServerRegistryEntry {
  pid: number
  url: string
  password: string
  version: string
  workspaceDir: string
  startedAt: number
}

/** Session -> model table, stored next to the registry under the same key. */
export type SessionModelTable = Record<string, { providerId: string; modelId: string }>

export function normalizeWorkspaceDir(dir: string): string {
  const unified = dir.replace(/\\/g, '/').replace(/\/+$/, '')
  return unified.toLowerCase()
}

export function registryKey(workspaceDir: string, version: string): string {
  return crypto
    .createHash('sha1')
    .update(`${normalizeWorkspaceDir(workspaceDir)}|${version}`)
    .digest('hex')
}

export function engineRegistryDir(serversDir: string, engineKind: string): string {
  return path.join(serversDir, engineKind)
}

export function registryPath(serversDir: string, engineKind: string, key: string): string {
  return path.join(engineRegistryDir(serversDir, engineKind), `${key}.json`)
}

export function modelsPath(serversDir: string, engineKind: string, key: string): string {
  return path.join(engineRegistryDir(serversDir, engineKind), `${key}.models.json`)
}

function isEntry(value: unknown): value is ServerRegistryEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.pid === 'number' &&
    Number.isInteger(entry.pid) &&
    typeof entry.url === 'string' &&
    typeof entry.password === 'string' &&
    typeof entry.version === 'string' &&
    typeof entry.workspaceDir === 'string' &&
    typeof entry.startedAt === 'number'
  )
}

/** Reads a registry file, returning null when it is missing or corrupt. */
export function readRegistry(file: string): ServerRegistryEntry | null {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
    return isEntry(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function writeRegistry(file: string, entry: ServerRegistryEntry): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(entry, null, 2)}\n`, 'utf8')
  restrictToCurrentUser(file)
}

export function deleteRegistry(file: string): void {
  try {
    fs.rmSync(file, { force: true })
  } catch {
    // Best effort: a leftover file is harmless, reuse will health-check it.
  }
}

export function listRegistries(
  serversDir: string,
): Array<{ engineKind: string; key: string; file: string; entry: ServerRegistryEntry }> {
  const results: Array<{
    engineKind: string
    key: string
    file: string
    entry: ServerRegistryEntry
  }> = []
  let engineKinds: string[]
  try {
    engineKinds = fs.readdirSync(serversDir)
  } catch {
    return results
  }
  for (const engineKind of engineKinds) {
    const dir = path.join(serversDir, engineKind)
    let files: string[]
    try {
      files = fs.readdirSync(dir)
    } catch {
      continue
    }
    for (const name of files) {
      if (!name.endsWith('.json') || name.endsWith('.models.json')) continue
      const file = path.join(dir, name)
      const entry = readRegistry(file)
      if (entry) results.push({ engineKind, key: name.slice(0, -'.json'.length), file, entry })
    }
  }
  return results
}

/** Windows ACL: drop inherited permissions and grant only the current user. */
export function restrictToCurrentUser(file: string): void {
  if (process.platform !== 'win32') return
  try {
    let user = os.userInfo().username
    const domain = process.env.USERDOMAIN
    if (domain) user = `${domain}\\${user}`
    execFileSync('icacls', [file, '/inheritance:r', '/grant:r', `${user}:R`], {
      stdio: 'ignore',
      windowsHide: true,
    })
  } catch {
    // ACL hardening is best-effort; the file is still protected by the user profile directory.
  }
}

export function isOpencodeProcess(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    if (process.platform === 'win32') {
      const output = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], {
        encoding: 'utf8',
        windowsHide: true,
      })
      return /"opencode(?:\.exe)?"/i.test(output)
    }
    const output = execFileSync('ps', ['-p', String(pid), '-o', 'comm='], { encoding: 'utf8' })
    return /opencode/i.test(output)
  } catch {
    return false
  }
}

export function portFromUrl(url: string): number | undefined {
  try {
    const port = Number(new URL(url).port)
    return Number.isInteger(port) && port > 0 ? port : undefined
  } catch {
    return undefined
  }
}

/**
 * Verifies that `pid` is the process currently listening on `port`.
 *
 * This is the strong identity check that stops a stale registry pid from
 * killing an unrelated process (notably the OpenCode **desktop app**, which is
 * also named `OpenCode.exe`): a reused pid will not own our registered port.
 * Returns `undefined` when the platform tool is unavailable, in which case the
 * caller decides whether to proceed.
 */
export function isPidListeningOnPort(pid: number, port: number | undefined): boolean | undefined {
  if (!Number.isInteger(pid) || pid <= 0 || !port) return false
  try {
    if (process.platform === 'win32') {
      const output = execFileSync('netstat', ['-ano', '-p', 'tcp'], {
        encoding: 'utf8',
        windowsHide: true,
      })
      return output.split(/\r?\n/).some((line) => {
        if (!/LISTENING/i.test(line)) return false
        const columns = line.trim().split(/\s+/)
        const local = columns[1]
        const owner = columns[columns.length - 1]
        return Boolean(local?.endsWith(`:${port}`)) && owner === String(pid)
      })
    }
    const output = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], {
      encoding: 'utf8',
    })
    return output.split(/\s+/).filter(Boolean).includes(String(pid))
  } catch {
    return undefined
  }
}

export async function isServerHealthy(
  url: string,
  password: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 4000,
): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const auth = Buffer.from(`opencode:${password}`).toString('base64')
    const response = await fetchImpl(`${url.replace(/\/$/, '')}/config`, {
      headers: { Authorization: `Basic ${auth}` },
      signal: controller.signal,
    })
    return response.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

export type ReuseDecision =
  | { action: 'start' }
  | { action: 'reuse'; entry: ServerRegistryEntry }
  | { action: 'restart'; entry: ServerRegistryEntry }

/**
 * Decides what to do with a registry entry without touching the filesystem.
 *
 * `ownsRegisteredPort` guards against killing a reused pid: the OpenCode
 * desktop app is also named `OpenCode.exe`, so the process name alone is not
 * enough. Only restart (and therefore kill) when the pid both looks like
 * opencode and is actually listening on our registered port. A stale entry
 * whose pid was recycled therefore degrades to `start` instead of killing an
 * unrelated process.
 */
export function decideServerReuse(
  entry: ServerRegistryEntry | null,
  checks: { isHealthy: boolean; isOpencodeProcess: boolean; ownsRegisteredPort: boolean },
): ReuseDecision {
  if (!entry) return { action: 'start' }
  if (checks.isHealthy) return { action: 'reuse', entry }
  if (checks.isOpencodeProcess && checks.ownsRegisteredPort) return { action: 'restart', entry }
  return { action: 'start' }
}

export function readModels(file: string): SessionModelTable {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!parsed || typeof parsed !== 'object') return {}
    const table: SessionModelTable = {}
    for (const [sessionId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (
        value &&
        typeof value === 'object' &&
        typeof (value as ModelRefLike).providerId === 'string' &&
        typeof (value as ModelRefLike).modelId === 'string'
      ) {
        table[sessionId] = {
          providerId: (value as ModelRefLike).providerId,
          modelId: (value as ModelRefLike).modelId,
        }
      }
    }
    return table
  } catch {
    return {}
  }
}

interface ModelRefLike {
  providerId: string
  modelId: string
}

export function writeModels(file: string, table: SessionModelTable): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(table, null, 2)}\n`, 'utf8')
}
