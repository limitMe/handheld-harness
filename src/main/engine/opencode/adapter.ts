import type {
  OpencodeClient,
  Session as OcSession,
  SessionStatus as OcSessionStatus,
} from '@opencode-ai/sdk/v2'
import type {
  AgentEngine,
  ChatMessage,
  CommandInfo,
  CreateSessionOptions,
  EngineCapabilities,
  EngineEvent,
  EngineKind,
  EngineMode,
  EngineSnapshot,
  EngineStatus,
  ModelCatalog,
  ModelRef,
  PermissionReply,
  PermissionRequest,
  QuestionRequest,
  RestartableEngine,
  SessionRunState,
  SessionSummary,
} from '../../../shared/engine'
import { resolveBinary, type ResolveBinaryOptions } from '../binary'
import { DeltaAggregator } from '../delta'
import {
  acquireServer,
  killServer,
  readBinaryVersion,
  releaseServer,
  type HostOptions,
  type ServerHandle,
} from '../host'
import { createRedactingLogger, type EngineLogger } from '../logger'
import {
  IGNORED_EVENT_TYPES,
  normalize,
  toChatMessage,
  toChatPart,
  toSessionSummary,
} from './normalize'
import { resolveSessionModel as resolveModel } from './model-resolution'
import { toModelCatalog, type ProviderListData } from './model-catalog'
import {
  effortsPath,
  modelsPath,
  readEfforts,
  readModels,
  registryKey,
  writeEfforts,
  writeModels,
  isServerHealthy,
  type SessionEffortTable,
  type SessionModelTable,
} from '../server-registry'

export interface OpenCodeEngineOptions {
  mode: EngineMode
  /** Undefined when no workspace is configured; the engine then reports `down`. */
  workspaceDir?: string
  serversDir: string
  logsDir: string
  sdkVersion: string
  baseDir: string
  binaryPath?: string
  externalUrl?: string
  externalPassword?: string
  configContent?: string
  logger: EngineLogger
  fetchImpl?: typeof fetch
  now?: () => number
  reconnectDelaysMs?: number[]
  healthIntervalMs?: number
  binaryResolve?: Partial<ResolveBinaryOptions>
  hostOverrides?: Partial<HostOptions>
}

const CAPABILITIES: EngineCapabilities = {
  streamingDeltas: true,
  permissionAlways: true,
  questions: true,
  commands: true,
  deleteSession: true,
  transcriptReplay: true,
  multiClient: true,
  forkSession: false,
  messageUsage: true,
  modelEffort: true,
  sessionDirectory: true,
}

const DEFAULT_RECONNECT_DELAYS = [500, 1000, 2000, 4000, 8000]

type SdkModule = typeof import('@opencode-ai/sdk/v2')

let sdkPromise: Promise<SdkModule> | undefined

/**
 * `@opencode-ai/sdk` is ESM-only and declares no `require` export condition,
 * so it cannot be loaded with a static import from the CommonJS main bundle or
 * from tsx scripts. A cached dynamic import works in both.
 */
function loadSdk(): Promise<SdkModule> {
  sdkPromise ??= import('@opencode-ai/sdk/v2')
  return sdkPromise
}

/** Commands OpenCode's TUI owns but the server command registry does not list (spec 02 section 6). */
const BUILT_IN_COMMANDS: CommandInfo[] = [
  { name: 'clear', description: 'Start a new session (handled in spec 12)' },
  { name: 'compact', description: 'Compact the current session (handled in spec 12)' },
]

function unwrap<T>(result: unknown): T {
  const value = result as { data?: T; error?: unknown } | undefined
  if (value && typeof value === 'object' && 'error' in value && value.error) {
    const error = value.error as { data?: { message?: string } } | undefined
    throw new Error(error?.data?.message ?? JSON.stringify(value.error))
  }
  return value?.data as T
}

function parseModelString(value: string | undefined): ModelRef | undefined {
  if (!value) return undefined
  const [providerId, ...rest] = value.split('/')
  const modelId = rest.join('/')
  return providerId && modelId ? { providerId, modelId } : undefined
}

export class OpenCodeEngine implements AgentEngine, RestartableEngine {
  readonly id = 'opencode'
  readonly kind: EngineKind = 'opencode'

  private readonly logger: EngineLogger
  private readonly listeners = new Set<(event: EngineEvent) => void>()
  private readonly now: () => number
  private readonly reconnectDelays: number[]
  private readonly delta: DeltaAggregator

  private status: EngineStatus = { state: 'starting' }
  private handle: ServerHandle | undefined
  private client: OpencodeClient | undefined
  private resolvedBinaryPath: string | undefined
  private streamAbort: AbortController | undefined
  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined
  private healthTimer: ReturnType<typeof setInterval> | undefined
  private restartTimestamps: number[] = []
  private recovering = false
  private stopping = false
  private started = false

  private readonly sessions = new Map<string, SessionSummary>()
  private readonly runStates = new Map<string, SessionRunState>()
  private readonly pendingPermissions = new Map<string, PermissionRequest>()
  private readonly pendingQuestions = new Map<string, QuestionRequest>()
  private readonly lastAssistantModels = new Map<string, ModelRef>()
  private readonly lastAssistantEfforts = new Map<string, string>()
  private models: SessionModelTable = {}
  private efforts: SessionEffortTable = {}
  private defaultModel: ModelRef | undefined

  constructor(private readonly options: OpenCodeEngineOptions) {
    this.now = options.now ?? Date.now
    this.reconnectDelays = options.reconnectDelaysMs ?? DEFAULT_RECONNECT_DELAYS
    this.logger = createRedactingLogger(options.logger, () => [this.handle?.password ?? ''])
    this.delta = new DeltaAggregator((payload) => this.emit({ type: 'part.delta', ...payload }))
  }

  capabilities(): EngineCapabilities {
    return { ...CAPABILITIES }
  }

  // ----- lifecycle -------------------------------------------------------

  async start(): Promise<void> {
    if (this.started) return
    this.started = true
    this.stopping = false
    await this.bootstrap()
  }

  async stop(): Promise<void> {
    this.stopping = true
    this.started = false
    this.clearTimers()
    this.streamAbort?.abort()
    this.delta.dispose()
    if (this.handle) {
      releaseServer(this.handle, { serversDir: this.options.serversDir, logger: this.logger })
    }
    this.handle = undefined
    this.client = undefined
  }

  async restart(): Promise<void> {
    this.logger.info('restarting opencode engine')
    this.clearTimers()
    this.streamAbort?.abort()
    if (this.handle) {
      killServer(this.handle, { serversDir: this.options.serversDir, logger: this.logger })
      this.handle = undefined
    }
    this.client = undefined
    this.stopping = false
    await this.bootstrap()
  }

  private async bootstrap(): Promise<void> {
    this.setStatus({ state: 'starting' })
    if (!this.options.workspaceDir) {
      this.setStatus({ state: 'down', error: 'No workspace configured', hint: this.downHint() })
      return
    }
    try {
      const handle = await this.acquire()
      this.handle = handle
      const { createOpencodeClient } = await loadSdk()
      this.client = createOpencodeClient({
        baseUrl: handle.url,
        headers: {
          Authorization: `Basic ${Buffer.from(`opencode:${handle.password}`).toString('base64')}`,
        },
        ...(this.options.fetchImpl ? { fetch: this.options.fetchImpl } : {}),
      })
      this.checkVersion()
      this.loadModelTable()
      this.attachChildWatch()
      await this.refreshAll()
      this.setStatus({
        state: 'ready',
        mode: this.options.mode,
        version: this.options.sdkVersion,
        workspaceDir: this.options.workspaceDir ?? '',
        pid: handle.pid,
      })
      void this.connectStream()
      this.startHealthMonitor()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.error('engine failed to start', message)
      this.setStatus({ state: 'down', error: message, hint: this.downHint() })
    }
  }

  private async acquire(): Promise<ServerHandle> {
    if (this.options.mode === 'external') {
      return acquireServer({
        ...this.hostOptions(),
        mode: 'external',
        binaryPath: this.options.binaryPath ?? '',
        externalUrl: this.options.externalUrl,
        password: this.options.externalPassword,
      })
    }
    const binaryPath = this.options.binaryPath ?? this.resolveBinaryPath()
    this.resolvedBinaryPath = binaryPath
    return acquireServer({ ...this.hostOptions(), mode: this.options.mode, binaryPath })
  }

  private resolveBinaryPath(): string {
    const resolution = resolveBinary({
      env: process.env,
      platform: process.platform,
      arch: process.arch,
      baseDir: this.options.baseDir,
      ...this.options.binaryResolve,
    })
    this.logger.info(`located opencode binary (${resolution.source})`, { path: resolution.path })
    return resolution.path
  }

  private hostOptions(): HostOptions {
    return {
      mode: this.options.mode,
      binaryPath: this.options.binaryPath ?? '',
      workspaceDir: this.options.workspaceDir ?? '',
      version: this.options.sdkVersion,
      logsDir: this.options.logsDir,
      serversDir: this.options.serversDir,
      logger: this.logger,
      fetchImpl: this.options.fetchImpl,
      now: this.now,
      ...this.options.hostOverrides,
    }
  }

  private checkVersion(): void {
    const binaryPath = this.resolvedBinaryPath
    if (!binaryPath) return
    const binaryVersion = readBinaryVersion(binaryPath)
    if (binaryVersion && binaryVersion !== this.options.sdkVersion) {
      this.logger.warn('opencode binary version differs from SDK version', {
        binaryVersion,
        sdkVersion: this.options.sdkVersion,
      })
    }
  }

  private downHint(): string {
    if (!this.options.workspaceDir) {
      return 'Set engine.workspaceDir in settings or HANDHELD_WORKSPACE.'
    }
    return 'Check that the workspace exists and the OpenCode binary is installed.'
  }

  private attachChildWatch(): void {
    const child = this.handle?.child
    if (!child) return
    child.on('exit', (code) => this.onChildExit(code))
  }

  private onChildExit(code: number | null): void {
    if (this.stopping || this.handle?.mode !== 'attached') return
    const now = this.now()
    this.restartTimestamps = this.restartTimestamps.filter((stamp) => now - stamp < 60_000)
    if (this.restartTimestamps.length >= 3) {
      this.setStatus({
        state: 'down',
        error: `OpenCode server exited (code ${code}) and crashed 3 times in 60s`,
        hint: 'Try restarting the server from the engine debug page.',
      })
      return
    }
    this.restartTimestamps.push(now)
    this.setStatus({
      state: 'reconnecting',
      attempt: this.restartTimestamps.length,
      lastError: `server exited (code ${code})`,
    })
    void this.recover('child-exit')
  }

  private startHealthMonitor(): void {
    if (this.options.mode !== 'detached') return
    const interval = this.options.healthIntervalMs ?? 10_000
    this.healthTimer = setInterval(() => {
      void this.checkHealth()
    }, interval)
  }

  private async checkHealth(): Promise<void> {
    if (!this.handle || this.recovering || this.stopping) return
    const healthy = await isServerHealthy(
      this.handle.url,
      this.handle.password,
      this.options.fetchImpl ?? fetch,
    )
    if (healthy) return
    this.setStatus({ state: 'reconnecting', attempt: 1, lastError: 'health check failed' })
    await this.recover('health')
  }

  private async recover(reason: string): Promise<void> {
    if (this.recovering || this.stopping) return
    this.recovering = true
    try {
      this.streamAbort?.abort()
      if (this.handle) {
        killServer(this.handle, { serversDir: this.options.serversDir, logger: this.logger })
        this.handle = undefined
      }
      this.client = undefined
      this.logger.info(`recovering engine (${reason})`)
      await this.bootstrap()
    } finally {
      this.recovering = false
    }
  }

  // ----- SSE -------------------------------------------------------------

  private async connectStream(): Promise<void> {
    const client = this.client
    if (!client) return
    const controller = new AbortController()
    this.streamAbort = controller
    try {
      const events = await client.event.subscribe({}, { signal: controller.signal })
      this.reconnectAttempt = 0
      for await (const raw of events.stream) {
        if (controller.signal.aborted) return
        this.handleRawEvent(raw)
      }
      if (!controller.signal.aborted) this.scheduleReconnect('event stream ended')
    } catch (error) {
      if (controller.signal.aborted || this.stopping) return
      this.scheduleReconnect(error instanceof Error ? error.message : String(error))
    }
  }

  private scheduleReconnect(lastError: string): void {
    if (this.stopping) return
    const index = Math.min(this.reconnectAttempt, this.reconnectDelays.length - 1)
    const delay = this.reconnectDelays[index] ?? 8000
    this.reconnectAttempt += 1
    this.setStatus({ state: 'reconnecting', attempt: this.reconnectAttempt, lastError })
    this.reconnectTimer = setTimeout(() => {
      void this.connectStream().then(() => {
        if (this.status.state === 'reconnecting') {
          this.setStatus({
            state: 'ready',
            mode: this.options.mode,
            version: this.options.sdkVersion,
            workspaceDir: this.options.workspaceDir ?? '',
            pid: this.handle?.pid,
          })
          void this.refreshAll()
        }
      })
    }, delay)
  }

  private handleRawEvent(raw: unknown): void {
    const events = normalize(raw)
    if (events.length === 0) {
      const type = (raw as { type?: unknown })?.type
      // Known no-op traffic (heartbeat, file watcher, ...) is expected, so it is
      // not worth a log line per event. Only genuinely unknown types are logged.
      if (typeof type === 'string' && IGNORED_EVENT_TYPES.has(type)) return
      this.logger.debug(`ignored ${String(type)} event`)
      return
    }
    for (const event of events) {
      this.applySideEffects(event)
      this.emit(event)
    }
  }

  private applySideEffects(event: EngineEvent): void {
    switch (event.type) {
      case 'session.upserted': {
        const runState = this.runStates.get(event.session.id) ?? event.session.runState
        const enriched = {
          ...event.session,
          runState,
          model: this.resolveSessionModel(event.session.id, event.session.model),
          effort: this.resolveSessionEffort(event.session.id, event.session.effort),
        }
        this.sessions.set(enriched.id, enriched)
        event.session = enriched
        break
      }
      case 'session.deleted':
        this.sessions.delete(event.sessionId)
        this.runStates.delete(event.sessionId)
        this.lastAssistantModels.delete(event.sessionId)
        this.lastAssistantEfforts.delete(event.sessionId)
        break
      case 'session.runState':
        this.runStates.set(event.sessionId, event.runState)
        this.patchSession(event.sessionId, { runState: event.runState })
        break
      case 'session.error':
        if (event.sessionId) this.patchSession(event.sessionId, { runState: 'error' })
        break
      case 'message.upserted':
        if (event.message.role === 'assistant') {
          if (event.message.model) {
            this.lastAssistantModels.set(event.message.sessionId, event.message.model)
          }
          if (event.message.effort) {
            this.lastAssistantEfforts.set(event.message.sessionId, event.message.effort)
          }
        }
        break
      case 'part.upserted':
        this.delta.flushNow()
        break
      case 'permission.asked':
        this.pendingPermissions.set(event.request.id, { ...event.request, createdAt: this.now() })
        event.request = this.pendingPermissions.get(event.request.id) as PermissionRequest
        break
      case 'permission.replied':
        this.pendingPermissions.delete(event.requestId)
        break
      case 'question.asked':
        this.pendingQuestions.set(event.request.id, event.request)
        break
      case 'question.replied':
        this.pendingQuestions.delete(event.requestId)
        break
      default:
        break
    }
  }

  private patchSession(sessionId: string, patch: Partial<SessionSummary>): void {
    const session = this.sessions.get(sessionId)
    if (session) this.sessions.set(sessionId, { ...session, ...patch })
  }

  private emit(event: EngineEvent): void {
    for (const listener of this.listeners) listener(event)
  }

  private setStatus(status: EngineStatus): void {
    this.status = status
    this.emit({ type: 'engine.status', status })
  }

  private clearTimers(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.healthTimer) clearInterval(this.healthTimer)
    this.reconnectTimer = undefined
    this.healthTimer = undefined
  }

  onEvent(listener: (event: EngineEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  // ----- model table -----------------------------------------------------

  private registryFile(kind: 'models' | 'efforts'): string {
    const key = registryKey(this.options.workspaceDir ?? '', this.options.sdkVersion)
    return kind === 'models'
      ? modelsPath(this.options.serversDir, 'opencode', key)
      : effortsPath(this.options.serversDir, 'opencode', key)
  }

  private loadModelTable(): void {
    this.models = readModels(this.registryFile('models'))
    this.efforts = readEfforts(this.registryFile('efforts'))
  }

  private persistModelTable(): void {
    try {
      writeModels(this.registryFile('models'), this.models)
    } catch (error) {
      this.logger.warn('failed to persist session model table', String(error))
    }
  }

  private persistEffortTable(): void {
    try {
      writeEfforts(this.registryFile('efforts'), this.efforts)
    } catch (error) {
      this.logger.warn('failed to persist session effort table', String(error))
    }
  }

  private resolveSessionModel(sessionId: string, serverModel?: ModelRef): ModelRef | undefined {
    return resolveModel({
      fromTable: this.models[sessionId],
      lastAssistant: this.lastAssistantModels.get(sessionId),
      serverModel,
      defaultModel: this.defaultModel,
    })
  }

  /** Chosen effort wins, then the last assistant turn, then the server session model. */
  private resolveSessionEffort(sessionId: string, serverEffort?: string): string | undefined {
    return this.efforts[sessionId] ?? this.lastAssistantEfforts.get(sessionId) ?? serverEffort
  }

  /** Working directory a session is pinned to; undefined means the engine default. */
  private sessionDirectory(sessionId: string): string | undefined {
    return this.sessions.get(sessionId)?.directory
  }

  // ----- reads -----------------------------------------------------------

  private requireClient(): OpencodeClient {
    if (!this.client) throw new Error('OpenCode engine is not ready')
    return this.client
  }

  private async refreshAll(): Promise<void> {
    await this.refreshSessions()
    await this.refreshPending()
    await this.refreshDefaultModel()
  }

  private async refreshSessions(): Promise<void> {
    try {
      const client = this.requireClient()
      const sessions = unwrap<OcSession[]>(await client.session.list({}))
      const statuses = unwrap<Record<string, OcSessionStatus>>(await client.session.status({}))
      const next = new Map<string, SessionSummary>()
      for (const info of sessions) {
        const runState = this.runStates.get(info.id) ?? toSharedRunState(statuses[info.id])
        const summary = toSessionSummary(info, runState)
        if (summary) next.set(summary.id, summary)
      }
      this.sessions.clear()
      for (const [id, summary] of next) this.sessions.set(id, summary)
      for (const summary of this.sessions.values()) {
        const enriched = {
          ...summary,
          model: this.resolveSessionModel(summary.id, summary.model),
          effort: this.resolveSessionEffort(summary.id, summary.effort),
        }
        this.sessions.set(summary.id, enriched)
        this.emit({ type: 'session.upserted', session: enriched })
      }
    } catch (error) {
      this.logger.warn('failed to refresh sessions', String(error))
    }
  }

  private async refreshPending(): Promise<void> {
    try {
      const client = this.requireClient()
      const permissions = unwrap<unknown[]>(await client.permission.list({}))
      const questions = unwrap<unknown[]>(await client.question.list({}))
      this.pendingPermissions.clear()
      this.pendingQuestions.clear()
      for (const raw of permissions) {
        const request = toPermissionRequestFromList(raw, this.now())
        if (request) this.pendingPermissions.set(request.id, request)
      }
      for (const raw of questions) {
        const request = toQuestionRequestFromList(raw)
        if (request) this.pendingQuestions.set(request.id, request)
      }
    } catch (error) {
      this.logger.warn('failed to refresh pending requests', String(error))
    }
  }

  private async refreshDefaultModel(): Promise<void> {
    try {
      const client = this.requireClient()
      const config = unwrap<{ model?: string }>(await client.config.get())
      const parsed = parseModelString(config.model)
      if (parsed) this.defaultModel = parsed
    } catch (error) {
      this.logger.debug('failed to read default model', String(error))
    }
  }

  async listSessions(): Promise<SessionSummary[]> {
    await this.refreshSessions()
    return this.sortedSessions()
  }

  private sortedSessions(): SessionSummary[] {
    return [...this.sessions.values()].sort((a, b) => b.updatedAt - a.updatedAt)
  }

  async snapshot(): Promise<EngineSnapshot> {
    return {
      engineId: this.id,
      kind: this.kind,
      capabilities: this.capabilities(),
      status: this.status,
      sessions: this.sortedSessions(),
      pendingPermissions: [...this.pendingPermissions.values()],
      pendingQuestions: [...this.pendingQuestions.values()],
      defaultModel: this.defaultModel,
    }
  }

  async getMessages(sessionId: string): Promise<ChatMessage[]> {
    const client = this.requireClient()
    const directory = this.sessionDirectory(sessionId)
    const raw = unwrap<Array<{ info: unknown; parts: unknown[] }>>(
      await client.session.messages({
        sessionID: sessionId,
        ...(directory ? { directory } : {}),
      }),
    )
    const messages: ChatMessage[] = []
    for (const entry of raw) {
      const info = toChatMessage(entry.info)
      if (!info) continue
      const parts = entry.parts
        .map(toChatPart)
        .filter((part): part is NonNullable<typeof part> => Boolean(part))
      messages.push({ ...info, parts })
      if (info.role === 'assistant') {
        if (info.model) this.lastAssistantModels.set(sessionId, info.model)
        if (info.effort) this.lastAssistantEfforts.set(sessionId, info.effort)
      }
    }
    return messages
  }

  async listModels(): Promise<ModelCatalog> {
    const client = this.requireClient()
    const data = unwrap<ProviderListData>(await client.provider.list({}))
    return toModelCatalog(data)
  }

  async listCommands(): Promise<CommandInfo[]> {
    const client = this.requireClient()
    const data = unwrap<Array<{ name: string; description?: string }>>(
      await client.command.list({}),
    )
    const serverCommands = data.map((command) => ({
      name: command.name,
      description: command.description,
    }))
    const names = new Set(serverCommands.map((command) => command.name))
    return [...serverCommands, ...BUILT_IN_COMMANDS.filter((command) => !names.has(command.name))]
  }

  async runCommand(sessionId: string, command: string, args?: string): Promise<void> {
    const client = this.requireClient()
    const name = command.replace(/^\//, '')
    const effort = this.resolveSessionEffort(sessionId)
    const directory = this.sessionDirectory(sessionId)
    try {
      unwrap<unknown>(
        await client.session.command({
          sessionID: sessionId,
          command: name,
          ...(args ? { arguments: args } : {}),
          ...(directory ? { directory } : {}),
          ...(effort ? { variant: effort } : {}),
        }),
      )
    } catch (error) {
      // `compact` also has a dedicated endpoint the command registry may omit.
      if (name === 'compact') {
        unwrap<unknown>(
          await client.session.summarize({
            sessionID: sessionId,
            ...(directory ? { directory } : {}),
          }),
        )
        return
      }
      throw error
    }
  }

  // ----- writes ----------------------------------------------------------

  async createSession(opts?: CreateSessionOptions): Promise<SessionSummary> {
    const client = this.requireClient()
    const info = unwrap<OcSession>(
      await client.session.create({
        ...(opts?.title ? { title: opts.title } : {}),
        ...(opts?.directory ? { directory: opts.directory } : {}),
        ...(opts?.model
          ? {
              model: {
                id: opts.model.modelId,
                providerID: opts.model.providerId,
                ...(opts.effort ? { variant: opts.effort } : {}),
              },
            }
          : {}),
      }),
    )
    if (opts?.model) {
      this.models[info.id] = opts.model
      this.persistModelTable()
    }
    if (opts?.effort) {
      this.efforts[info.id] = opts.effort
      this.persistEffortTable()
    }
    const summary = toSessionSummary(info, 'idle')
    if (!summary) throw new Error('OpenCode returned an invalid session')
    const enriched = {
      ...summary,
      model: this.resolveSessionModel(summary.id, summary.model),
      effort: this.resolveSessionEffort(summary.id, summary.effort),
    }
    this.sessions.set(enriched.id, enriched)
    this.emit({ type: 'session.upserted', session: enriched })
    return enriched
  }

  async deleteSession(sessionId: string): Promise<void> {
    const client = this.requireClient()
    const directory = this.sessionDirectory(sessionId)
    await client.session.delete({
      sessionID: sessionId,
      ...(directory ? { directory } : {}),
    })
    this.sessions.delete(sessionId)
    this.runStates.delete(sessionId)
    this.lastAssistantModels.delete(sessionId)
    this.lastAssistantEfforts.delete(sessionId)
  }

  async setSessionModel(sessionId: string, model: ModelRef): Promise<void> {
    this.models[sessionId] = model
    this.persistModelTable()
    const session = this.sessions.get(sessionId)
    if (session) {
      const enriched = { ...session, model }
      this.sessions.set(sessionId, enriched)
      this.emit({ type: 'session.upserted', session: enriched })
    }
  }

  async setSessionEffort(sessionId: string, effort: string): Promise<void> {
    this.efforts[sessionId] = effort
    this.persistEffortTable()
    const session = this.sessions.get(sessionId)
    if (session) {
      const enriched = { ...session, effort }
      this.sessions.set(sessionId, enriched)
      this.emit({ type: 'session.upserted', session: enriched })
    }
  }

  async prompt(sessionId: string, input: { text: string }): Promise<void> {
    const client = this.requireClient()
    const model = this.resolveSessionModel(sessionId)
    const effort = this.resolveSessionEffort(sessionId)
    const directory = this.sessionDirectory(sessionId)
    unwrap<unknown>(
      await client.session.promptAsync({
        sessionID: sessionId,
        parts: [{ type: 'text', text: input.text }],
        ...(directory ? { directory } : {}),
        ...(model ? { model: { providerID: model.providerId, modelID: model.modelId } } : {}),
        ...(effort ? { variant: effort } : {}),
      }),
    )
  }

  async abort(sessionId: string): Promise<void> {
    const client = this.requireClient()
    const directory = this.sessionDirectory(sessionId)
    await client.session.abort({
      sessionID: sessionId,
      ...(directory ? { directory } : {}),
    })
  }

  async replyPermission(
    _sessionId: string,
    requestId: string,
    reply: PermissionReply,
  ): Promise<void> {
    const client = this.requireClient()
    await client.permission.reply({ requestID: requestId, reply })
    this.pendingPermissions.delete(requestId)
  }

  async replyQuestion(_sessionId: string, requestId: string, answers: string[][]): Promise<void> {
    const client = this.requireClient()
    await client.question.reply({ requestID: requestId, answers })
    this.pendingQuestions.delete(requestId)
  }

  async rejectQuestion(_sessionId: string, requestId: string): Promise<void> {
    const client = this.requireClient()
    await client.question.reject({ requestID: requestId })
    this.pendingQuestions.delete(requestId)
  }
}

function toSharedRunState(status: OcSessionStatus | undefined): SessionRunState {
  if (!status) return 'idle'
  if (status.type === 'busy') return 'busy'
  if (status.type === 'retry') return 'retry'
  return 'idle'
}

function toPermissionRequestFromList(
  raw: unknown,
  createdAt: number,
): PermissionRequest | undefined {
  const value = raw as {
    id?: string
    sessionID?: string
    permission?: string
    patterns?: string[]
    metadata?: Record<string, unknown>
  }
  if (!value.id || !value.sessionID || !value.permission) return undefined
  const patterns = Array.isArray(value.patterns) ? value.patterns : []
  const command = typeof value.metadata?.command === 'string' ? value.metadata.command : undefined
  return {
    id: value.id,
    sessionId: value.sessionID,
    title: command ?? patterns[0] ?? value.permission,
    kind: value.permission,
    patterns,
    createdAt,
  }
}

function toQuestionRequestFromList(raw: unknown): QuestionRequest | undefined {
  const value = raw as { id?: string; sessionID?: string; questions?: unknown[] }
  if (!value.id || !value.sessionID || !Array.isArray(value.questions)) return undefined
  const questions = value.questions.flatMap((item) => {
    const question = item as {
      question?: string
      header?: string
      multiple?: boolean
      options?: Array<{ label?: string; description?: string }>
    }
    if (!question.question) return []
    return [
      {
        header: question.header,
        question: question.question,
        multiple: question.multiple === true,
        options: (question.options ?? []).flatMap((option) =>
          option.label ? [{ label: option.label, description: option.description }] : [],
        ),
      },
    ]
  })
  if (questions.length === 0) return undefined
  return { id: value.id, sessionId: value.sessionID, questions }
}
