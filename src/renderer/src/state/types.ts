import type {
  ChatMessage,
  EngineCapabilities,
  EngineStatus,
  PermissionReply,
  PermissionRequest,
  QuestionRequest,
  SessionRef,
  SessionSummary,
} from '@shared/engine'

export interface EngineEntry {
  status: EngineStatus
  capabilities?: EngineCapabilities
}

/**
 * A mid-round permission or question the user already answered. Kept so the
 * transcript can show the choice as a right-aligned card that splits the agent
 * output above and below it (spec 13).
 */
export interface AnsweredChoice {
  id: string
  sessionId: string
  /** Message count when the request was asked; positions the card in the round. */
  anchor: number
  request: {
    kind: 'permission' | 'question'
    title: string
    detail?: string
  }
  answer:
    | { type: 'permission'; reply: PermissionReply }
    | { type: 'question'; answers: string[][]; ignored: boolean }
}

export interface UiState {
  current: SessionRef | null
  /** Composer drafts live in memory only; they survive session switches but not restarts. */
  drafts: Record<string, string>
  /** Bumped on every task open, so reopening the current task re-anchors the transcript. */
  openSeq: number
}

export interface TasksState {
  /** Open tasks shown on the task map, ordered by creation time (spec 14). Persisted. */
  open: SessionRef[]
  /** Session keys whose "finished while you were away" red dot is showing. Persisted. */
  unread: Record<string, true>
  /** Session keys that were left while busy; cleared when you return. In-memory only. */
  watched: Record<string, true>
}

export interface WorkbenchState {
  engines: Record<string, EngineEntry>
  /** Keyed by `sessionKey`. */
  sessions: Record<string, SessionSummary>
  messages: Record<string, ChatMessage[]>
  messagesLoaded: Record<string, boolean>
  pendingPermissions: Record<string, PermissionRequest[]>
  pendingQuestions: Record<string, QuestionRequest[]>
  /** Answered mid-round confirmations, keyed by `sessionKey` (spec 13). */
  answeredChoices: Record<string, AnsweredChoice[]>
  tasks: TasksState
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
    answeredChoices: {},
    tasks: { open: [], unread: {}, watched: {} },
    ui: { current: null, drafts: {}, openSeq: 0 },
  }
}

export function sameSessionRef(a: SessionRef | null, b: SessionRef | null): boolean {
  if (!a || !b) return a === b
  return a.engineId === b.engineId && a.sessionId === b.sessionId
}

/** Returns the same record when the key is absent, so identity checks stay cheap. */
export function omitKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record
  const next = { ...record }
  delete next[key]
  return next
}

/** Inserts a ref so `open` stays ordered by the sessions' creation time (spec 14). */
export function insertByCreatedAt(
  open: SessionRef[],
  ref: SessionRef,
  sessions: Record<string, SessionSummary>,
): SessionRef[] {
  if (open.some((entry) => sameSessionRef(entry, ref))) return open
  const createdAt = (entry: SessionRef): number =>
    sessions[sessionKey(entry)]?.createdAt ?? Number.MAX_SAFE_INTEGER
  const at = createdAt(ref)
  const index = open.findIndex((entry) => createdAt(entry) > at)
  if (index < 0) return [...open, ref]
  return [...open.slice(0, index), ref, ...open.slice(index)]
}
