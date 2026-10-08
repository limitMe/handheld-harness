import type {
  ModelRef,
  ChatMessage,
  ChatPart,
  EngineEvent,
  MessageUsage,
  PermissionRequest,
  QuestionRequest,
  SessionRunState,
  SessionSummary,
} from '../../../shared/engine'

/**
 * Pure mapping from a raw OpenCode SSE event to our own `EngineEvent`s.
 *
 * The input is typed loosely on purpose: the server can emit event types that
 * are not in the locked SDK union, and normalization must never throw at
 * runtime. Unknown events map to an empty array and are logged by the adapter.
 */

type Dict = Record<string, unknown>

function asDict(value: unknown): Dict | undefined {
  return value && typeof value === 'object' ? (value as Dict) : undefined
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function modelFromSession(value: unknown): ModelRef | undefined {
  const model = asDict(value)
  if (!model) return undefined
  const modelId = asString(model.id)
  const providerId = asString(model.providerID)
  return modelId && providerId ? { providerId, modelId } : undefined
}

function modelFromMessage(value: unknown): ModelRef | undefined {
  const model = asDict(value)
  if (!model) return undefined
  const modelId = asString(model.modelID) ?? asString(model.id)
  const providerId = asString(model.providerID)
  return modelId && providerId ? { providerId, modelId } : undefined
}

/** Token/cost usage of an assistant message (spec 21); undefined when absent. */
export function toMessageUsage(info: unknown): MessageUsage | undefined {
  const message = asDict(info)
  const tokens = asDict(message?.tokens)
  if (!tokens) return undefined
  const input = asNumber(tokens.input) ?? 0
  const output = asNumber(tokens.output) ?? 0
  const reasoning = asNumber(tokens.reasoning) ?? 0
  const cache = asDict(tokens.cache)
  const cacheRead = asNumber(cache?.read) ?? 0
  const cacheWrite = asNumber(cache?.write) ?? 0
  return {
    input,
    output,
    reasoning,
    cacheRead,
    cacheWrite,
    total: asNumber(tokens.total) ?? input + output + reasoning + cacheRead + cacheWrite,
    cost: asNumber(message?.cost) ?? 0,
  }
}

export function toSessionSummary(
  info: unknown,
  runState: SessionRunState = 'idle',
): SessionSummary | undefined {
  const session = asDict(info)
  if (!session) return undefined
  const id = asString(session.id)
  const time = asDict(session.time)
  if (!id || !time) return undefined
  return {
    id,
    title: asString(session.title) ?? 'Untitled',
    createdAt: asNumber(time.created) ?? 0,
    updatedAt: asNumber(time.updated) ?? 0,
    runState,
    parentId: asString(session.parentID),
    model: modelFromSession(session.model),
    effort: asString(asDict(session.model)?.variant),
    directory: asString(session.directory),
  }
}

export function toChatMessage(info: unknown): Omit<ChatMessage, 'parts'> | undefined {
  const message = asDict(info)
  if (!message) return undefined
  const id = asString(message.id)
  const sessionId = asString(message.sessionID)
  const role = message.role === 'user' || message.role === 'assistant' ? message.role : undefined
  const time = asDict(message.time)
  if (!id || !sessionId || !role || !time) return undefined
  const error = asDict(message.error)
  const errorData = asDict(error?.data)
  return {
    id,
    sessionId,
    role,
    createdAt: asNumber(time.created) ?? 0,
    completedAt: asNumber(time.completed),
    model: modelFromMessage(role === 'assistant' ? message : message.model),
    effort: role === 'assistant' ? asString(message.variant) : undefined,
    usage: role === 'assistant' ? toMessageUsage(message) : undefined,
    error: asString(errorData?.message),
  }
}

function summarizeInput(input: unknown): string | undefined {
  const dict = asDict(input)
  if (!dict) return undefined
  const text = JSON.stringify(dict)
  return text.length > 160 ? `${text.slice(0, 157)}...` : text
}

export function toChatPart(part: unknown): ChatPart | undefined {
  const value = asDict(part)
  const id = asString(value?.id)
  const type = asString(value?.type)
  if (!value || !id || !type) return undefined

  switch (type) {
    case 'text':
      return {
        id,
        type: 'text',
        text: asString(value.text) ?? '',
        synthetic: value.synthetic === true,
      }
    case 'reasoning':
      return { id, type: 'reasoning', text: asString(value.text) ?? '' }
    case 'tool': {
      const state = asDict(value.state)
      const status = asString(state?.status)
      const mapped =
        status === 'pending' || status === 'running' || status === 'completed' || status === 'error'
          ? status
          : 'pending'
      return {
        id,
        type: 'tool',
        tool: asString(value.tool) ?? 'tool',
        title: asString(state?.title),
        state: mapped,
        inputSummary: summarizeInput(state?.input),
        output: asString(state?.output),
        error: asString(state?.error),
      }
    }
    case 'file':
      return {
        id,
        type: 'file',
        filename: asString(value.filename),
        mime: asString(value.mime) ?? 'application/octet-stream',
        url: asString(value.url) ?? '',
      }
    default:
      return { id, type: 'other', rawType: type }
  }
}

function toRunState(status: unknown): SessionRunState {
  const type = asString(asDict(status)?.type)
  if (type === 'busy') return 'busy'
  if (type === 'retry') return 'retry'
  return 'idle'
}

function toPermissionRequest(properties: Dict): PermissionRequest | undefined {
  const id = asString(properties.id)
  const sessionId = asString(properties.sessionID)
  if (!id || !sessionId) return undefined

  const legacyPermission = asString(properties.permission)
  if (legacyPermission) {
    const patterns = asArray(properties.patterns)
      .map(asString)
      .filter((p): p is string => Boolean(p))
    const metadata = asDict(properties.metadata)
    const command = asString(metadata?.command)
    return {
      id,
      sessionId,
      title: command ?? patterns[0] ?? legacyPermission,
      kind: legacyPermission,
      patterns,
      createdAt: 0,
    }
  }

  const action = asString(properties.action)
  if (!action) return undefined
  const patterns = asArray(properties.resources)
    .map(asString)
    .filter((p): p is string => Boolean(p))
  return { id, sessionId, title: patterns[0] ?? action, kind: action, patterns, createdAt: 0 }
}

function toQuestionRequest(properties: Dict): QuestionRequest | undefined {
  const id = asString(properties.id)
  const sessionId = asString(properties.sessionID)
  if (!id || !sessionId) return undefined
  const questions = asArray(properties.questions).flatMap((raw) => {
    const question = asDict(raw)
    const text = asString(question?.question)
    if (!question || !text) return []
    const options = asArray(question.options).flatMap((rawOption) => {
      const option = asDict(rawOption)
      const label = asString(option?.label)
      if (!option || !label) return []
      return [{ label, description: asString(option.description) }]
    })
    return [
      {
        header: asString(question.header),
        question: text,
        multiple: question.multiple === true,
        options,
      },
    ]
  })
  if (questions.length === 0) return undefined
  return { id, sessionId, questions }
}

export function normalize(raw: unknown): EngineEvent[] {
  const event = asDict(raw)
  const type = asString(event?.type)
  const properties = asDict(event?.properties) ?? {}
  if (!type) return []

  switch (type) {
    case 'session.created':
    case 'session.updated': {
      const session = toSessionSummary(properties.info)
      return session ? [{ type: 'session.upserted', session }] : []
    }
    case 'session.deleted': {
      const sessionId = asString(properties.sessionID)
      return sessionId ? [{ type: 'session.deleted', sessionId }] : []
    }
    case 'session.status': {
      const sessionId = asString(properties.sessionID)
      return sessionId
        ? [{ type: 'session.runState', sessionId, runState: toRunState(properties.status) }]
        : []
    }
    case 'session.idle': {
      const sessionId = asString(properties.sessionID)
      return sessionId ? [{ type: 'session.runState', sessionId, runState: 'idle' }] : []
    }
    case 'session.error': {
      const error = asDict(properties.error)
      const message =
        asString(asDict(error?.data)?.message) ?? asString(error?.name) ?? 'Unknown error'
      return [{ type: 'session.error', sessionId: asString(properties.sessionID), message }]
    }
    case 'message.updated': {
      const message = toChatMessage(properties.info)
      return message ? [{ type: 'message.upserted', message }] : []
    }
    case 'message.part.updated': {
      const sessionId = asString(properties.sessionID)
      const part = toChatPart(properties.part)
      const messageId = asString(asDict(properties.part)?.messageID)
      return sessionId && part && messageId
        ? [{ type: 'part.upserted', sessionId, messageId, part }]
        : []
    }
    case 'message.part.delta': {
      const sessionId = asString(properties.sessionID)
      const messageId = asString(properties.messageID)
      const partId = asString(properties.partID)
      const delta = asString(properties.delta)
      const field = asString(properties.field)
      if (!sessionId || !messageId || !partId || !delta) return []
      if (field && field !== 'text' && field !== 'reasoning') return []
      return [{ type: 'part.delta', sessionId, messageId, partId, delta }]
    }
    case 'permission.asked':
    case 'permission.v2.asked': {
      const request = toPermissionRequest(properties)
      return request ? [{ type: 'permission.asked', request }] : []
    }
    case 'permission.replied':
    case 'permission.v2.replied': {
      const sessionId = asString(properties.sessionID)
      const requestId = asString(properties.requestID)
      return sessionId && requestId ? [{ type: 'permission.replied', sessionId, requestId }] : []
    }
    case 'question.asked':
    case 'question.v2.asked': {
      const request = toQuestionRequest(properties)
      return request ? [{ type: 'question.asked', request }] : []
    }
    case 'question.replied':
    case 'question.v2.replied':
    case 'question.rejected':
    case 'question.v2.rejected': {
      const sessionId = asString(properties.sessionID)
      const requestId = asString(properties.requestID)
      return sessionId && requestId ? [{ type: 'question.replied', sessionId, requestId }] : []
    }
    default:
      return []
  }
}

/** Event types that are known but intentionally produce no `EngineEvent`. */
export const IGNORED_EVENT_TYPES = new Set([
  'message.part.removed',
  'message.removed',
  'server.connected',
  'server.heartbeat',
  'global.disposed',
  'installation.updated',
  'installation.update-available',
  'file.edited',
  'session.diff',
  'todo.updated',
  'lsp.updated',
  'mcp.tools.changed',
  'pty.created',
  'pty.updated',
  'pty.exited',
  'pty.deleted',
  'plugin.added',
  'catalog.updated',
  'reference.updated',
  'integration.updated',
  'integration.connection.updated',
  'models-dev.refreshed',
  'project.updated',
  'project.directories.updated',
  'file.watcher.updated',
  'command.executed',
])
