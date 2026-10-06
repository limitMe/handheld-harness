import crypto from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { execFileSync, spawn as nodeSpawn, type ChildProcess } from 'node:child_process'
import type { EngineMode } from '../../shared/engine'
import type { EngineLogger } from './logger'
import { redactSecrets } from './logger'
import {
  decideServerReuse,
  deleteRegistry,
  isOpencodeProcess,
  isPidListeningOnPort,
  isServerHealthy,
  portFromUrl,
  readRegistry,
  registryKey,
  registryPath,
  writeRegistry,
  type ServerRegistryEntry,
} from './server-registry'

/**
 * Owns the OpenCode server process. It deliberately does not use the SDK's
 * `createOpencodeServer()`: that helper calls whatever `opencode` is on PATH,
 * pins port 4096, and has no password or detached mode. Here we pick a free
 * port ourselves and poll the health endpoint, so we never depend on parsing
 * stdout (which is redirected to a log file in detached mode).
 */

export interface HostOptions {
  mode: EngineMode
  binaryPath: string
  workspaceDir: string
  version: string
  logsDir: string
  serversDir: string
  password?: string
  externalUrl?: string
  configContent?: string
  logger: EngineLogger
  spawn?: typeof nodeSpawn
  fetchImpl?: typeof fetch
  now?: () => number
  healthTimeoutMs?: number
  processAlive?: (pid: number) => boolean
}

export interface ServerHandle {
  mode: EngineMode
  url: string
  password: string
  version: string
  workspaceDir: string
  key: string
  pid?: number
  reused: boolean
  /** Non-detached children are tracked so attached mode can kill the tree. */
  child?: ChildProcess
}

export function randomPassword(): string {
  return crypto.randomBytes(32).toString('hex')
}

export function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = address && typeof address === 'object' ? address.port : 0
      server.close(() => resolve(port))
    })
  })
}

export function readBinaryVersion(binaryPath: string): string | undefined {
  try {
    return execFileSync(binaryPath, ['--version'], { encoding: 'utf8', windowsHide: true }).trim()
  } catch {
    return undefined
  }
}

function serverLogFile(logsDir: string): string {
  return path.join(logsDir, 'opencode-server.log')
}

export async function waitForHealthy(
  url: string,
  password: string,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number; signal?: AbortSignal },
): Promise<boolean> {
  const fetchImpl = options.fetchImpl ?? fetch
  const deadline = Date.now() + (options.timeoutMs ?? 20_000)
  while (Date.now() < deadline) {
    if (options.signal?.aborted) return false
    if (await isServerHealthy(url, password, fetchImpl)) return true
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  return false
}

export function killProcessTree(pid: number, spawnImpl: typeof nodeSpawn = nodeSpawn): void {
  if (!Number.isInteger(pid) || pid <= 0) return
  try {
    if (process.platform === 'win32') {
      spawnImpl('taskkill', ['/pid', String(pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      })
      return
    }
    process.kill(pid, 'SIGKILL')
  } catch {
    // The process may already be gone.
  }
}

function startChildProcess(
  options: HostOptions,
  url: string,
  port: number,
  password: string,
): ChildProcess {
  const spawnImpl = options.spawn ?? nodeSpawn
  fs.mkdirSync(options.logsDir, { recursive: true })
  const logFd = fs.openSync(serverLogFile(options.logsDir), 'a')
  const env: NodeJS.ProcessEnv = { ...process.env, OPENCODE_SERVER_PASSWORD: password }
  if (options.configContent) env.OPENCODE_CONFIG_CONTENT = options.configContent

  const child = spawnImpl(options.binaryPath, ['serve', `--port=${port}`, '--hostname=127.0.0.1'], {
    cwd: options.workspaceDir,
    env,
    detached: options.mode === 'detached',
    windowsHide: true,
    stdio: ['ignore', logFd, logFd],
  })
  fs.closeSync(logFd)

  if (options.mode === 'detached') {
    child.unref()
  }
  options.logger.info(
    'spawned opencode server',
    redactSecrets({ mode: options.mode, url, pid: child.pid }, [password]),
  )
  return child
}

async function startServer(options: HostOptions): Promise<ServerHandle> {
  if (!fs.existsSync(options.workspaceDir)) {
    throw new Error(`Workspace directory does not exist: ${options.workspaceDir}`)
  }
  const key = registryKey(options.workspaceDir, options.version)
  const port = await findFreePort()
  const url = `http://127.0.0.1:${port}`
  const password = options.password ?? randomPassword()

  const child = startChildProcess(options, url, port, password)
  const healthy = await waitForHealthy(url, password, {
    fetchImpl: options.fetchImpl,
    timeoutMs: options.healthTimeoutMs,
  })
  if (!healthy) {
    if (child.pid) killProcessTree(child.pid, options.spawn)
    throw new Error(`OpenCode server did not become healthy at ${url}`)
  }

  const entry: ServerRegistryEntry = {
    pid: child.pid ?? 0,
    url,
    password,
    version: options.version,
    workspaceDir: options.workspaceDir,
    startedAt: (options.now ?? Date.now)(),
  }
  if (entry.pid) writeRegistry(registryPath(options.serversDir, 'opencode', key), entry)

  return {
    mode: options.mode,
    url,
    password,
    version: options.version,
    workspaceDir: options.workspaceDir,
    key,
    pid: child.pid,
    reused: false,
    child: options.mode === 'detached' ? undefined : child,
  }
}

function externalServer(options: HostOptions): ServerHandle {
  const url = options.externalUrl?.trim()
  if (!url) throw new Error('external mode requires HANDHELD_OPENCODE_URL')
  const key = registryKey(options.workspaceDir, options.version)
  return {
    mode: 'external',
    url,
    password: options.password ?? '',
    version: options.version,
    workspaceDir: options.workspaceDir,
    key,
    reused: false,
  }
}

export async function acquireServer(options: HostOptions): Promise<ServerHandle> {
  if (options.mode === 'external') return externalServer(options)

  const key = registryKey(options.workspaceDir, options.version)
  const file = registryPath(options.serversDir, 'opencode', key)
  const entry = readRegistry(file)

  if (entry) {
    const healthy = await isServerHealthy(entry.url, entry.password, options.fetchImpl ?? fetch)
    const isOpencode = (options.processAlive ?? isOpencodeProcess)(entry.pid)
    const ownsPort = isPidListeningOnPort(entry.pid, portFromUrl(entry.url)) === true
    const decision = decideServerReuse(entry, {
      isHealthy: healthy,
      isOpencodeProcess: isOpencode,
      ownsRegisteredPort: ownsPort,
    })

    if (decision.action === 'reuse') {
      options.logger.info(
        `reused server pid=${entry.pid}`,
        redactSecrets({ url: entry.url }, [entry.password]),
      )
      return {
        mode: options.mode,
        url: entry.url,
        password: entry.password,
        version: entry.version,
        workspaceDir: entry.workspaceDir,
        key,
        pid: entry.pid,
        reused: true,
      }
    }

    if (decision.action === 'restart' && decision.entry.pid) {
      options.logger.warn(`restarting unhealthy server pid=${decision.entry.pid}`)
      killProcessTree(decision.entry.pid, options.spawn)
    } else if (entry && isOpencode && !ownsPort) {
      // Stale registry whose pid now belongs to something else (e.g. the
      // OpenCode desktop app). Never kill it; just start a fresh server.
      options.logger.warn(
        `ignoring stale registry entry pid=${entry.pid} (pid no longer owns ${entry.url})`,
      )
    }
    deleteRegistry(file)
  }

  return startServer(options)
}

/** Forcefully stops a server and forgets it. Used by the debug page's restart action. */
export function killServer(
  handle: ServerHandle,
  options: Pick<HostOptions, 'serversDir' | 'spawn' | 'logger'>,
): void {
  if (handle.mode === 'external') return
  if (handle.pid) {
    const ownsPort = isPidListeningOnPort(handle.pid, portFromUrl(handle.url))
    if (ownsPort === false) {
      // The pid was recycled by another process (possibly the OpenCode desktop
      // app); never kill it just because the name matches.
      options.logger.warn(`refusing to kill pid=${handle.pid}: it no longer owns ${handle.url}`)
    } else {
      killProcessTree(handle.pid, options.spawn)
      options.logger.info('stopped opencode server', { pid: handle.pid })
    }
  }
  deleteRegistry(registryPath(options.serversDir, 'opencode', handle.key))
}

/**
 * Releases a server when the app exits. Attached servers (and their whole
 * process tree) are killed; detached servers keep running so a restarting
 * Electron app can reconnect to in-flight work.
 */
export function releaseServer(
  handle: ServerHandle,
  options: Pick<HostOptions, 'serversDir' | 'spawn' | 'logger'>,
): void {
  if (handle.mode === 'attached') {
    killServer(handle, options)
  }
}
