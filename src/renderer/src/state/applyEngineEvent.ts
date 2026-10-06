import type { EngineEventPayload } from '@shared/engine'
import { sessionKey, type WorkbenchState } from './types'

/**
 * Pure reducer for engine events. Kept free of zustand and the preload bridge
 * so the event semantics can be unit-tested in isolation.
 *
 * Unknown sessions are tolerated: message and pending events for a session the
 * store has not loaded are dropped so a late event can never create a
 * half-populated transcript.
 */
export function applyEngineEvent(
  state: WorkbenchState,
  { engineId, event }: EngineEventPayload,
): WorkbenchState {
  switch (event.type) {
    case 'engine.status': {
      const entry = state.engines[engineId] ?? { status: event.status }
      return {
        ...state,
        engines: { ...state.engines, [engineId]: { ...entry, status: event.status } },
      }
    }

    case 'session.upserted': {
      const key = sessionKey({ engineId, sessionId: event.session.id })
      return { ...state, sessions: { ...state.sessions, [key]: event.session } }
    }

    case 'session.deleted': {
      const key = sessionKey({ engineId, sessionId: event.sessionId })
      const sessions = { ...state.sessions }
      delete sessions[key]
      const messages = { ...state.messages }
      delete messages[key]
      const messagesLoaded = { ...state.messagesLoaded }
      delete messagesLoaded[key]
      const pendingPermissions = { ...state.pendingPermissions }
      delete pendingPermissions[key]
      const pendingQuestions = { ...state.pendingQuestions }
      delete pendingQuestions[key]
      const current =
        state.ui.current && sessionKey(state.ui.current) === key ? null : state.ui.current
      return {
        ...state,
        sessions,
        messages,
        messagesLoaded,
        pendingPermissions,
        pendingQuestions,
        ui: { ...state.ui, current },
      }
    }

    case 'session.runState': {
      const key = sessionKey({ engineId, sessionId: event.sessionId })
      const session = state.sessions[key]
      if (!session) return state
      return {
        ...state,
        sessions: { ...state.sessions, [key]: { ...session, runState: event.runState } },
      }
    }

    case 'session.error': {
      if (!event.sessionId) return state
      const key = sessionKey({ engineId, sessionId: event.sessionId })
      const session = state.sessions[key]
      if (!session) return state
      return {
        ...state,
        sessions: { ...state.sessions, [key]: { ...session, runState: 'error' } },
      }
    }

    case 'message.upserted': {
      const key = sessionKey({ engineId, sessionId: event.message.sessionId })
      if (!state.messagesLoaded[key]) return state
      const list = state.messages[key] ?? []
      const index = list.findIndex((message) => message.id === event.message.id)
      const next = [...list]
      const existing = next[index]
      if (existing) next[index] = { ...existing, ...event.message, parts: existing.parts }
      else next.push({ ...event.message, parts: [] })
      return { ...state, messages: { ...state.messages, [key]: next } }
    }

    case 'part.upserted': {
      const key = sessionKey({ engineId, sessionId: event.sessionId })
      const list = state.messages[key]
      if (!list) return state
      const messageIndex = list.findIndex((message) => message.id === event.messageId)
      const message = list[messageIndex]
      if (!message) return state
      const parts = [...message.parts]
      const partIndex = parts.findIndex((part) => part.id === event.part.id)
      if (partIndex >= 0) parts[partIndex] = event.part
      else parts.push(event.part)
      const next = [...list]
      next[messageIndex] = { ...message, parts }
      return { ...state, messages: { ...state.messages, [key]: next } }
    }

    case 'part.delta': {
      const key = sessionKey({ engineId, sessionId: event.sessionId })
      const list = state.messages[key]
      if (!list) return state
      const messageIndex = list.findIndex((message) => message.id === event.messageId)
      const message = list[messageIndex]
      if (!message) return state
      const parts = [...message.parts]
      const partIndex = parts.findIndex((part) => part.id === event.partId)
      const part = parts[partIndex]
      if (!part || (part.type !== 'text' && part.type !== 'reasoning')) return state
      parts[partIndex] = { ...part, text: part.text + event.delta }
      const next = [...list]
      next[messageIndex] = { ...message, parts }
      return { ...state, messages: { ...state.messages, [key]: next } }
    }

    case 'permission.asked': {
      const key = sessionKey({ engineId, sessionId: event.request.sessionId })
      const list = state.pendingPermissions[key] ?? []
      if (list.some((request) => request.id === event.request.id)) return state
      return {
        ...state,
        pendingPermissions: { ...state.pendingPermissions, [key]: [...list, event.request] },
      }
    }

    case 'permission.replied': {
      const key = sessionKey({ engineId, sessionId: event.sessionId })
      const list = state.pendingPermissions[key]
      if (!list) return state
      const next = list.filter((request) => request.id !== event.requestId)
      const pendingPermissions = { ...state.pendingPermissions }
      if (next.length > 0) pendingPermissions[key] = next
      else delete pendingPermissions[key]
      return { ...state, pendingPermissions }
    }

    case 'question.asked': {
      const key = sessionKey({ engineId, sessionId: event.request.sessionId })
      const list = state.pendingQuestions[key] ?? []
      if (list.some((request) => request.id === event.request.id)) return state
      return { ...state, pendingQuestions: { ...state.pendingQuestions, [key]: [...list, event.request] } }
    }

    case 'question.replied': {
      const key = sessionKey({ engineId, sessionId: event.sessionId })
      const list = state.pendingQuestions[key]
      if (!list) return state
      const next = list.filter((request) => request.id !== event.requestId)
      const pendingQuestions = { ...state.pendingQuestions }
      if (next.length > 0) pendingQuestions[key] = next
      else delete pendingQuestions[key]
      return { ...state, pendingQuestions }
    }

    default:
      return state
  }
}
