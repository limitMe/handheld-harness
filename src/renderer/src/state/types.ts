import type {
  ChatMessage,
  EngineCapabilities,
  EngineStatus,
  PermissionRequest,
  QuestionRequest,
  SessionRef,
  SessionSummary,
} from '@shared/engine'

export interface EngineEntry {
  status: EngineStatus
  capabilities?: EngineCapabilities
}

export interface UiState {
  current: SessionRef | null
  /** Composer drafts live in memory only; they survive session switches but not restarts. */
  drafts: Record<string, string>
}

export interface WorkbenchState {
  engines: Record<string, EngineEntry>
  /** Keyed by `sessionKey`. */
  sessions: Record<string, SessionSummary>
  messages: Record<string, ChatMessage[]>
  messagesLoaded: Record<string, boolean>
  pendingPermissions: Record<string, PermissionRequest[]>
  pendingQuestions: Record<string, QuestionRequest[]>
  ui: UiState
}

export function sessionKey(ref: SessionRef): string {
  return `${ref.engineId}:${ref.sessionId}`
}

export function keyParts(key: string): SessionRef | null {
  const separator = key.indexOf(':')
  if (separator <= 0) return null
  return { engineId: key.slice(0, separator), sessionId: key.slice(separator + 1) }
}

export function initialWorkbenchState(): WorkbenchState {
  return {
    engines: {},
    sessions: {},
    messages: {},
    messagesLoaded: {},
    pendingPermissions: {},
    pendingQuestions: {},
    ui: { current: null, drafts: {} },
  }
}
