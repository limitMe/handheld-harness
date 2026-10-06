import type {
  AgentEngine,
  ChatMessage,
  ChatPart,
  CommandInfo,
  EngineCapabilities,
  EngineEvent,
  EngineKind,
  EngineSnapshot,
  EngineStatus,
  ModelGroup,
  ModelRef,
  PermissionReply,
  PermissionRequest,
  QuestionRequest,
  SessionRunState,
  SessionSummary,
} from '../../../shared/engine'
import { normalize } from '../opencode/normalize'
import { parseFakeCapabilities, type EngineCapabilitiesInput } from './capabilities'
import { loadFixtureEvents, remapSessionId } from './fixture'
import { longMarkdown, manyMessages } from './scenarios'

export interface FakeEngineOptions {
  /** Full capability set, or the raw `HANDHELD_FAKE_CAPABILITIES` string. */
  capabilities?: EngineCapabilitiesInput
  fixturePath?: string
  workspaceDir?: string
  now?: () => number
  /** Delay between replayed fixture events; keeps deltas visibly streamed. */
  eventDelayMs?: number
  deltaDelayMs?: number
  deltaChunkSize?: number
}

const DEFAULT_MODEL: ModelRef = { providerId: 'fake', modelId: 'fake-model' }

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Offline `AgentEngine` that replays recorded fixtures and scripted scenarios.
 * It performs no network or credential work, so it is safe for e2e runs and
 * UI development. It is only registered when `HANDHELD_ENGINE_MODE=fake`.
 */
export class FakeEngine implements AgentEngine {
  readonly id = 'fake'
  readonly kind: EngineKind = 'fake'

  private readonly caps: EngineCapabilities
  private readonly fixture: unknown[]
  private readonly now: () => number
  private readonly eventDelayMs: number
  private readonly deltaDelayMs: number
  private readonly deltaChunkSize: number

  private readonly listeners = new Set<(event: EngineEvent) => void>()
  private readonly sessions = new Map<string, SessionSummary>()
  private readonly messages = new Map<string, ChatMessage[]>()
  private readonly runStates = new Map<string, SessionRunState>()
  private readonly pendingPermissions = new Map<string, PermissionRequest>()
  private readonly pendingQuestions = new Map<string, QuestionRequest>()
  private readonly models = new Map<string, ModelRef>()
  private readonly aborted = new Set<string>()
  private readonly waiters = new Map<string, { sessionId: string; resolve: (value: string) => void }>()

  private status: EngineStatus = { state: 'starting' }
  private counter = 0

  constructor(private readonly options: FakeEngineOptions = {}) {
    this.caps =
      typeof options.capabilities === 'string'
        ? parseFakeCapabilities(options.capabilities)
        : { ...parseFakeCapabilities(undefined), ...options.capabilities }
    this.fixture = loadFixtureEvents(options.fixturePath)
    this.now = options.now ?? Date.now
    this.eventDelayMs = options.eventDelayMs ?? 8
    this.deltaDelayMs = options.deltaDelayMs ?? 12
    this.deltaChunkSize = options.deltaChunkSize ?? 48
  }

  capabilities(): EngineCapabilities {
    return { ...this.caps }
  }

  async start(): Promise<void> {
    this.setStatus({
      state: 'ready',
      mode: 'fake',
      version: 'fake',
      workspaceDir: this.options.workspaceDir ?? '',
    })
  }

  async stop(): Promise<void> {
    for (const waiter of this.waiters.values()) waiter.resolve('abort')
    this.waiters.clear()
    this.aborted.clear()
  }

  onEvent(listener: (event: EngineEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
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
      defaultModel: DEFAULT_MODEL,
    }
  }

  async listSessions(): Promise<SessionSummary[]> {
    return this.sortedSessions()
  }

  async createSession(opts?: { title?: string; model?: ModelRef }): Promise<SessionSummary> {
    const id = this.nextId('ses')
    const timestamp = this.now()
    const summary: SessionSummary = {
      id,
      title: opts?.title ?? `Fake session ${this.sessions.size + 1}`,
      createdAt: timestamp,
      updatedAt: timestamp,
      runState: 'idle',
      model: opts?.model ?? DEFAULT_MODEL,
    }
    if (opts?.model) this.models.set(id, opts.model)
    this.sessions.set(id, summary)
    this.messages.set(id, [])
    this.emitNormalized({ type: 'session.upserted', session: summary })
    return summary
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId)
    this.messages.delete(sessionId)
    this.runStates.delete(sessionId)
    this.models.delete(sessionId)
    this.emitNormalized({ type: 'session.deleted', sessionId })
  }

  async getMessages(sessionId: string): Promise<ChatMessage[]> {
    return [...(this.messages.get(sessionId) ?? [])].sort((a, b) => a.createdAt - b.createdAt)
  }

  async setSessionModel(sessionId: string, model: ModelRef): Promise<void> {
    this.models.set(sessionId, model)
    const session = this.sessions.get(sessionId)
    if (!session) return
    const next = { ...session, model }
    this.sessions.set(sessionId, next)
    this.emitNormalized({ type: 'session.upserted', session: next })
  }

  async prompt(sessionId: string, input: { text: string }): Promise<void> {
    if (!this.sessions.has(sessionId)) throw new Error(`Unknown fake session: ${sessionId}`)
    this.aborted.delete(sessionId)
    this.pushUserMessage(sessionId, input.text)
    this.setRunState(sessionId, 'busy')
    void this.runScenario(sessionId, input.text).catch(() => undefined)
  }

  async abort(sessionId: string): Promise<void> {
    this.aborted.add(sessionId)
    this.resolveSessionWaiters(sessionId, 'abort')
    this.setRunState(sessionId, 'idle')
  }

  async replyPermission(
    _sessionId: string,
    requestId: string,
    reply: PermissionReply,
  ): Promise<void> {
    this.resolveWaiter(`perm:${requestId}`, reply)
  }

  async replyQuestion(_sessionId: string, requestId: string, answers: string[][]): Promise<void> {
    this.resolveWaiter(`question:${requestId}`, answers.flat().join(', '))
  }

  async rejectQuestion(_sessionId: string, requestId: string): Promise<void> {
    this.resolveWaiter(`question:${requestId}`, 'ignore')
  }

  async listModels(): Promise<ModelGroup[]> {
    return [
      {
        providerId: 'fake',
        name: 'Fake provider',
        models: [{ id: 'fake-model', name: 'Fake model' }],
      },
    ]
  }

  async listCommands(): Promise<CommandInfo[]> {
    return [
      { name: 'clear', description: 'Start a new session' },
      { name: 'compact', description: 'Compact the current session' },
    ]
  }

  // ----- scenarios -------------------------------------------------------

  private async runScenario(sessionId: string, text: string): Promise<void> {
    const trimmed = text.trim()
    const scenario = trimmed.startsWith('/fake ')
      ? (trimmed.slice('/fake '.length).trim().split(/\s+/)[0] ?? '')
      : ''
    let finalState: SessionRunState = 'idle'
    switch (scenario) {
      case 'long':
        await this.runLong(sessionId)
        break
      case 'permission':
        await this.runPermission(sessionId)
        break
      case 'question':
        await this.runQuestion(sessionId)
        break
      case 'error':
        finalState = this.runError(sessionId)
        break
      case 'many':
        this.runMany(sessionId)
        break
      default:
        await this.runFixture(sessionId)
        break
    }
    if (!this.aborted.has(sessionId)) this.setRunState(sessionId, finalState)
  }

  private async runFixture(sessionId: string): Promise<void> {
    if (this.fixture.length === 0) {
      await this.streamAssistant(sessionId, `Fake reply to: ${this.lastUserText(sessionId)}`)
      return
    }
    const script = remapSessionId(this.fixture, sessionId)
    const skipMessages = new Set<string>()
    for (const raw of script) {
      if (this.aborted.has(sessionId)) return
      const type = (raw as { type?: string }).type
      // Recorded session metadata carries the recorder's title/model and must not
      // overwrite the fake session the renderer opened.
      if (type === 'session.updated' || type === 'session.created') continue
      const properties = ((raw as { properties?: Record<string, unknown> }).properties ??
        {}) as Record<string, unknown>
      if (type === 'message.updated') {
        const info = properties.info as { role?: string; id?: string } | undefined
        if (info?.role === 'user') {
          if (info.id) skipMessages.add(info.id)
          continue
        }
      }
      if (type === 'message.part.updated' || type === 'message.part.delta') {
        const part = properties.part as { messageID?: string } | undefined
        const messageId = (properties.messageID as string | undefined) ?? part?.messageID
        if (messageId && skipMessages.has(messageId)) continue
      }
      for (const event of normalize(raw)) {
        if (event.type === 'part.delta' && !this.caps.streamingDeltas) continue
        this.emitNormalized(event)
      }
      await sleep(this.eventDelayMs)
    }
  }

  private async runLong(sessionId: string): Promise<void> {
    await this.streamAssistant(sessionId, longMarkdown())
  }

  private async runPermission(sessionId: string): Promise<void> {
    const requestId = this.nextId('perm')
    const request: PermissionRequest = {
      id: requestId,
      sessionId,
      title: 'node -v',
      kind: 'bash',
      patterns: ['node -v'],
      createdAt: this.now(),
    }
    this.emitNormalized({ type: 'permission.asked', request })
    const reply = await this.waitFor(sessionId, `perm:${requestId}`)
    this.emitNormalized({ type: 'permission.replied', sessionId, requestId })
    if (reply === 'abort') return
    this.pushAssistant(sessionId, reply === 'reject' ? 'Permission rejected.' : 'Permission granted.')
  }

  private async runQuestion(sessionId: string): Promise<void> {
    const requestId = this.nextId('question')
    const request: QuestionRequest = {
      id: requestId,
      sessionId,
      questions: [
        {
          header: 'Choice',
          question: 'Which option should the fake engine take?',
          multiple: false,
          options: [
            { label: 'Option A', description: 'The first option' },
            { label: 'Option B', description: 'The second option' },
          ],
        },
      ],
    }
    this.emitNormalized({ type: 'question.asked', request })
    const answer = await this.waitFor(sessionId, `question:${requestId}`)
    this.emitNormalized({ type: 'question.replied', sessionId, requestId })
    if (answer === 'abort') return
    this.pushAssistant(sessionId, `Answer received: ${answer}`)
  }

  private runError(sessionId: string): SessionRunState {
    this.emitNormalized({
      type: 'session.error',
      sessionId,
      message: 'Fake engine error: this session failed on purpose.',
    })
    return 'error'
  }

  private runMany(sessionId: string): void {
    for (const message of manyMessages(200)) {
      if (this.aborted.has(sessionId)) return
      if (message.role === 'user') this.pushUserMessage(sessionId, message.text)
      else this.pushAssistant(sessionId, message.text)
    }
  }

  // ----- transcript ------------------------------------------------------

  private nextId(prefix: string): string {
    this.counter += 1
    return `${prefix}_fake_${this.counter}_${Math.random().toString(36).slice(2, 8)}`
  }

  private pushUserMessage(sessionId: string, text: string): void {
    const timestamp = this.now()
    const message: Omit<ChatMessage, 'parts'> = {
      id: this.nextId('msg'),
      sessionId,
      role: 'user',
      createdAt: timestamp,
      completedAt: timestamp,
    }
    this.emitNormalized({ type: 'message.upserted', message })
    this.emitNormalized({
      type: 'part.upserted',
      sessionId,
      messageId: message.id,
      part: { id: this.nextId('prt'), type: 'text', text },
    })
  }

  private pushAssistant(sessionId: string, text: string): void {
    const timestamp = this.now()
    const message: Omit<ChatMessage, 'parts'> = {
      id: this.nextId('msg'),
      sessionId,
      role: 'assistant',
      createdAt: timestamp,
      completedAt: timestamp,
      model: this.models.get(sessionId) ?? DEFAULT_MODEL,
    }
    this.emitNormalized({ type: 'message.upserted', message })
    this.emitNormalized({
      type: 'part.upserted',
      sessionId,
      messageId: message.id,
      part: { id: this.nextId('prt'), type: 'text', text },
    })
  }

  private async streamAssistant(sessionId: string, text: string): Promise<void> {
    const timestamp = this.now()
    const message: Omit<ChatMessage, 'parts'> = {
      id: this.nextId('msg'),
      sessionId,
      role: 'assistant',
      createdAt: timestamp,
      model: this.models.get(sessionId) ?? DEFAULT_MODEL,
    }
    this.emitNormalized({ type: 'message.upserted', message })
    const partId = this.nextId('prt')
    this.emitNormalized({
      type: 'part.upserted',
      sessionId,
      messageId: message.id,
      part: { id: partId, type: 'text', text: '' },
    })
    if (this.caps.streamingDeltas) {
      for (let offset = 0; offset < text.length; offset += this.deltaChunkSize) {
        if (this.aborted.has(sessionId)) return
        this.emitNormalized({
          type: 'part.delta',
          sessionId,
          messageId: message.id,
          partId,
          delta: text.slice(offset, offset + this.deltaChunkSize),
        })
        await sleep(this.deltaDelayMs)
      }
    }
    this.emitNormalized({
      type: 'part.upserted',
      sessionId,
      messageId: message.id,
      part: { id: partId, type: 'text', text },
    })
    this.emitNormalized({
      type: 'message.upserted',
      message: { ...message, completedAt: this.now() },
    })
  }

  private lastUserText(sessionId: string): string {
    const list = this.messages.get(sessionId) ?? []
    for (let index = list.length - 1; index >= 0; index -= 1) {
      const message = list[index]
      if (message?.role === 'user') {
        const part = message.parts.find((candidate) => candidate.type === 'text')
        return part && part.type === 'text' ? part.text : ''
      }
    }
    return ''
  }

  // ----- bookkeeping -----------------------------------------------------

  private emit(event: EngineEvent): void {
    for (const listener of this.listeners) listener(event)
  }

  private emitNormalized(event: EngineEvent): void {
    this.apply(event)
    this.emit(event)
  }

  private apply(event: EngineEvent): void {
    switch (event.type) {
      case 'session.upserted': {
        const runState = this.runStates.get(event.session.id) ?? event.session.runState
        this.sessions.set(event.session.id, { ...event.session, runState })
        break
      }
      case 'session.deleted': {
        this.sessions.delete(event.sessionId)
        this.messages.delete(event.sessionId)
        this.runStates.delete(event.sessionId)
        break
      }
      case 'session.runState': {
        this.runStates.set(event.sessionId, event.runState)
        this.patchSession(event.sessionId, { runState: event.runState })
        break
      }
      case 'session.error': {
        if (event.sessionId) this.patchSession(event.sessionId, { runState: 'error' })
        break
      }
      case 'message.upserted': {
        this.upsertMessage(event.message)
        break
      }
      case 'part.upserted': {
        this.upsertPart(event.sessionId, event.messageId, event.part)
        break
      }
      case 'part.delta': {
        this.appendDelta(event.sessionId, event.messageId, event.partId, event.delta)
        break
      }
      case 'permission.asked': {
        this.pendingPermissions.set(event.request.id, event.request)
        break
      }
      case 'permission.replied': {
        this.pendingPermissions.delete(event.requestId)
        break
      }
      case 'question.asked': {
        this.pendingQuestions.set(event.request.id, event.request)
        break
      }
      case 'question.replied': {
        this.pendingQuestions.delete(event.requestId)
        break
      }
      default:
        break
    }
  }

  private upsertMessage(message: Omit<ChatMessage, 'parts'>): void {
    const list = this.messages.get(message.sessionId) ?? []
    const index = list.findIndex((candidate) => candidate.id === message.id)
    const existing = list[index]
    if (existing) list[index] = { ...existing, ...message, parts: existing.parts }
    else list.push({ ...message, parts: [] })
    this.messages.set(message.sessionId, list)
  }

  private upsertPart(sessionId: string, messageId: string, part: ChatPart): void {
    const message = this.messages.get(sessionId)?.find((candidate) => candidate.id === messageId)
    if (!message) return
    const index = message.parts.findIndex((candidate) => candidate.id === part.id)
    if (index >= 0) message.parts[index] = part
    else message.parts.push(part)
  }

  private appendDelta(sessionId: string, messageId: string, partId: string, delta: string): void {
    const message = this.messages.get(sessionId)?.find((candidate) => candidate.id === messageId)
    if (!message) return
    const index = message.parts.findIndex((candidate) => candidate.id === partId)
    const part = message.parts[index]
    if (!part || (part.type !== 'text' && part.type !== 'reasoning')) return
    message.parts[index] = { ...part, text: part.text + delta }
  }

  private patchSession(sessionId: string, patch: Partial<SessionSummary>): void {
    const session = this.sessions.get(sessionId)
    if (session) this.sessions.set(sessionId, { ...session, ...patch })
  }

  private setRunState(sessionId: string, runState: SessionRunState): void {
    this.emitNormalized({ type: 'session.runState', sessionId, runState })
  }

  private setStatus(status: EngineStatus): void {
    this.status = status
    this.emit({ type: 'engine.status', status })
  }

  private sortedSessions(): SessionSummary[] {
    return [...this.sessions.values()].sort((a, b) => b.updatedAt - a.updatedAt)
  }

  // ----- waiters ---------------------------------------------------------

  private waitFor(sessionId: string, key: string): Promise<string> {
    return new Promise((resolve) => {
      this.waiters.set(key, { sessionId, resolve })
    })
  }

  private resolveWaiter(key: string, value: string): void {
    const waiter = this.waiters.get(key)
    if (!waiter) return
    this.waiters.delete(key)
    waiter.resolve(value)
  }

  private resolveSessionWaiters(sessionId: string, value: string): void {
    for (const [key, waiter] of this.waiters) {
      if (waiter.sessionId === sessionId) {
        this.waiters.delete(key)
        waiter.resolve(value)
      }
    }
  }
}
