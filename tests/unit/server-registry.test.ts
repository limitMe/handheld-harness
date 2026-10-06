import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  decideServerReuse,
  isPidListeningOnPort,
  listRegistries,
  modelsPath,
  normalizeWorkspaceDir,
  portFromUrl,
  readModels,
  readRegistry,
  registryKey,
  registryPath,
  writeModels,
  writeRegistry,
  type ServerRegistryEntry,
} from '../../src/main/engine/server-registry'

let dir: string | undefined

function makeDir(): string {
  dir = mkdtempSync(path.join(tmpdir(), 'hha-registry-'))
  return dir
}

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
  dir = undefined
})

const ENTRY: ServerRegistryEntry = {
  pid: 1234,
  url: 'http://127.0.0.1:5555',
  password: 'secret',
  version: '1.18.34',
  workspaceDir: 'C:/Apps/Repo',
  startedAt: 1,
}

describe('registry key', () => {
  it('normalizes case and separators', () => {
    expect(normalizeWorkspaceDir('C:\\Apps\\Repo\\')).toBe('c:/apps/repo')
    expect(registryKey('C:\\Apps\\Repo', '1.18.34')).toBe(registryKey('c:/apps/repo', '1.18.34'))
  })

  it('changes with the version', () => {
    expect(registryKey('C:/x', 'a')).not.toBe(registryKey('C:/x', 'b'))
  })
})

describe('registry files', () => {
  it('round-trips an entry and lists it', () => {
    const base = makeDir()
    const file = registryPath(base, 'opencode', 'key1')
    writeRegistry(file, ENTRY)
    writeModels(modelsPath(base, 'opencode', 'key1'), { ses_1: { providerId: 'p', modelId: 'm' } })

    expect(readRegistry(file)).toEqual(ENTRY)
    const listed = listRegistries(base)
    expect(listed).toHaveLength(1)
    expect(listed[0]?.key).toBe('key1')
    expect(readModels(modelsPath(base, 'opencode', 'key1'))).toEqual({
      ses_1: { providerId: 'p', modelId: 'm' },
    })
  })

  it('returns null for a corrupt or missing registry file', () => {
    const base = makeDir()
    const file = path.join(base, 'bad.json')
    writeFileSync(file, '{ not json')
    expect(readRegistry(file)).toBeNull()
    expect(readRegistry(path.join(base, 'missing.json'))).toBeNull()
    writeFileSync(file, JSON.stringify({ pid: 'not-a-number' }))
    expect(readRegistry(file)).toBeNull()
  })

  it('returns an empty table for a corrupt models file', () => {
    const base = makeDir()
    const file = modelsPath(base, 'opencode', 'key')
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, 'garbage')
    expect(readModels(file)).toEqual({})
  })
})

describe('decideServerReuse', () => {
  it('starts when there is no entry', () => {
    expect(
      decideServerReuse(null, {
        isHealthy: false,
        isOpencodeProcess: false,
        ownsRegisteredPort: false,
      }),
    ).toEqual({ action: 'start' })
  })

  it('reuses a healthy server', () => {
    expect(
      decideServerReuse(ENTRY, {
        isHealthy: true,
        isOpencodeProcess: true,
        ownsRegisteredPort: true,
      }),
    ).toEqual({ action: 'reuse', entry: ENTRY })
  })

  it('restarts when the process is alive, ours, and owns the port but unhealthy', () => {
    expect(
      decideServerReuse(ENTRY, {
        isHealthy: false,
        isOpencodeProcess: true,
        ownsRegisteredPort: true,
      }),
    ).toEqual({ action: 'restart', entry: ENTRY })
  })

  it('never restarts when the pid does not own the registered port (recycled pid)', () => {
    // This is the OpenCode desktop app case: same process name, different process.
    expect(
      decideServerReuse(ENTRY, {
        isHealthy: false,
        isOpencodeProcess: true,
        ownsRegisteredPort: false,
      }),
    ).toEqual({ action: 'start' })
  })

  it('starts fresh when the pid is gone', () => {
    expect(
      decideServerReuse(ENTRY, {
        isHealthy: false,
        isOpencodeProcess: false,
        ownsRegisteredPort: false,
      }),
    ).toEqual({ action: 'start' })
  })
})

describe('port helpers', () => {
  it('parses the port from a URL', () => {
    expect(portFromUrl('http://127.0.0.1:53230')).toBe(53230)
    expect(portFromUrl('not a url')).toBeUndefined()
  })

  it('detects the process listening on a port', async () => {
    const server = createServer()
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    const port = address && typeof address === 'object' ? address.port : 0
    try {
      const result = isPidListeningOnPort(process.pid, port)
      // netstat / lsof may be unavailable in some environments.
      if (result !== undefined) expect(result).toBe(true)
      expect(isPidListeningOnPort(process.pid, 1)).not.toBe(true)
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})

describe('listRegistries', () => {
  it('does not treat the models file as a registry entry', () => {
    const base = makeDir()
    writeRegistry(registryPath(base, 'opencode', 'key1'), ENTRY)
    writeModels(modelsPath(base, 'opencode', 'key1'), {})
    const names = readdirSync(path.join(base, 'opencode'))
    expect(names).toContain('key1.models.json')
    expect(listRegistries(base)).toHaveLength(1)
  })
})
