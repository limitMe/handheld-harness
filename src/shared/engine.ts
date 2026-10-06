/**
 * Engine abstraction shared by main and renderer.
 *
 * This is the only data shape the renderer may see; native OpenCode types must
 * never leak past the adapter. Keep it base-agnostic: differences between
 * backends are expressed through `EngineCapabilities`, sessions are always
 * referenced through `SessionRef`, and models are set per session.
 */

// Extend this union when a new backend is added (see spec 02 section 9).
export type EngineKind = 'opencode' | 'fake'

export interface EngineCapabilities {
  streamingDeltas: boolean
  permissionAlways: boolean
  questions: boolean
  commands: boolean
  deleteSession: boolean
  transcriptReplay: boolean
  multiClient: boolean
  forkSession: boolean
}

export interface SessionRef {
  engineId: string
  sessionId: string
}

export type EngineMode = 'attached' | 'detached' | 'external' | 'fake'

export type EngineStatus =
  | { state: 'starting' }
  | { state: 'ready'; mode: EngineMode; version: string; workspaceDir: string; pid?: number }
  | { state: 'reconnecting'; attempt: number; lastError?: string }
  | { state: 'down'; error: string; hint?: string }

export type SessionRunState = 'idle' | 'busy' | 'retry' | 'error'

export interface ModelRef {
  providerId: string
  modelId: string
}

export interface SessionSummary {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  runState: SessionRunState
  parentId?: string
  model?: ModelRef
}

export type ChatPart =
  | { id: string; type: 'text'; text: string; synthetic?: boolean }
  | { id: string; type: 'reasoning'; text: string }
  | {
      id: string
      type: 'tool'
      tool: string
      title?: string
      state: 'pending' | 'running' | 'completed' | 'error'
      inputSummary?: string
      output?: string
      error?: string
    }
  | { id: string; type: 'file'; filename?: string; mime: string; url: string }
  | { id: string; type: 'other'; rawType: string }

export interface ChatMessage {
  id: string
  sessionId: string
  role: 'user' | 'assistant'
  createdAt: number
  completedAt?: number
  model?: ModelRef
  error?: string
  parts: ChatPart[]
}

export interface PermissionRequest {
  id: string
  sessionId: string
  title: string
  kind: string
  patterns: string[]
  createdAt: number
}

export type PermissionReply = 'once' | 'always' | 'reject'

export interface QuestionRequest {
  id: string
  sessionId: string
  questions: Array<{
    header?: string
    question: string
    multiple?: boolean
    options: Array<{ label: string; description?: string }>
  }>
}

export type EngineEvent =
  | { type: 'engine.status'; status: EngineStatus }
  | { type: 'session.upserted'; session: SessionSummary }
  | { type: 'session.deleted'; sessionId: string }
  | { type: 'session.runState'; sessionId: string; runState: SessionRunState }
  | { type: 'session.error'; sessionId?: string; message: string }
  | { type: 'message.upserted'; message: Omit<ChatMessage, 'parts'> }
  | { type: 'part.upserted'; sessionId: string; messageId: string; part: ChatPart }
  | { type: 'part.delta'; sessionId: string; messageId: string; partId: string; delta: string }
  | { type: 'permission.asked'; request: PermissionRequest }
  | { type: 'permission.replied'; sessionId: string; requestId: string }
  | { type: 'question.asked'; request: QuestionRequest }
  | { type: 'question.replied'; sessionId: string; requestId: string }

export type EngineEventPayload = { engineId: string; event: EngineEvent }

export interface EngineSnapshot {
  engineId: string
  kind: EngineKind
  capabilities: EngineCapabilities
  status: EngineStatus
  sessions: SessionSummary[]
  pendingPermissions: PermissionRequest[]
  pendingQuestions: QuestionRequest[]
  defaultModel?: ModelRef
}

export interface ModelGroup {
  providerId: string
  name: string
  models: Array<{ id: string; name: string }>
}

export interface CommandInfo {
  name: string
  description?: string
}

export interface EngineInfo {
  engineId: string
  kind: EngineKind
}

export interface AgentEngine {
  /** Engine instance id, e.g. 'opencode'. It is persisted inside SessionRef and must stay stable. */
  readonly id: string
  readonly kind: EngineKind
  capabilities(): EngineCapabilities
  snapshot(): Promise<EngineSnapshot>
  listSessions(): Promise<SessionSummary[]>
  createSession(opts?: { title?: string; model?: ModelRef }): Promise<SessionSummary>
  deleteSession(sessionId: string): Promise<void>
  getMessages(sessionId: string): Promise<ChatMessage[]>
  setSessionModel(sessionId: string, model: ModelRef): Promise<void>
  prompt(sessionId: string, input: { text: string }): Promise<void>
  abort(sessionId: string): Promise<void>
  replyPermission(sessionId: string, requestId: string, reply: PermissionReply): Promise<void>
  replyQuestion(sessionId: string, requestId: string, answers: string[][]): Promise<void>
  rejectQuestion(sessionId: string, requestId: string): Promise<void>
  listModels(): Promise<ModelGroup[]>
  listCommands(): Promise<CommandInfo[]>
  /**
   * Runs a command that cannot go through the normal prompt path (spec 12),
   * e.g. `/compact`. `command` may be given with or without a leading slash.
   */
  runCommand(sessionId: string, command: string, args?: string): Promise<void>
  onEvent(listener: (e: EngineEvent) => void): () => void
}

/** Lifecycle a host supplies to an engine, used by the debug page's restart action. */
export interface RestartableEngine {
  restart(): Promise<void>
}
