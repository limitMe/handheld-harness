import { describe, expect, it } from 'vitest'
import type { ChatMessage, EngineEventPayload } from '../../src/shared/engine'
import { applyEngineEvent } from '../../src/renderer/src/state/applyEngineEvent'
import { initialWorkbenchState, sessionKey } from '../../src/renderer/src/state/types'

const engineId = 'fake'

function payload(event: EngineEventPayload['event']): EngineEventPayload {
  return { engineId, event }
}

function message(id: string, role: 'user' | 'assistant' = 'assistant'): ChatMessage {
  return { id, sessionId: 's1', role, createdAt: 1, parts: [] }
}

function loadedState() {
  const state = initialWorkbenchState()
  state.sessions[sessionKey({ engineId, sessionId: 's1' })] = {
    id: 's1',
    title: 'Task',
    createdAt: 0,
    updatedAt: 0,
    runState: 'busy',
  }
  state.messagesLoaded[sessionKey({ engineId, sessionId: 's1' })] = true
  state.messages[sessionKey({ engineId, sessionId: 's1' })] = [message('m1')]
  return state
}

describe('applyEngineEvent', () => {
  it('appends deltas to a streamed text part', () => {
    let state = loadedState()
    state = applyEngineEvent(
      state,
      payload({
        type: 'part.upserted',
        sessionId: 's1',
        messageId: 'm1',
        part: { id: 'p1', type: 'text', text: '' },
      }),
    )
    state = applyEngineEvent(
      state,
      payload({
        type: 'part.delta',
        sessionId: 's1',
        messageId: 'm1',
        partId: 'p1',
        delta: 'Hel',
      }),
    )
    state = applyEngineEvent(
      state,
      payload({
        type: 'part.delta',
        sessionId: 's1',
        messageId: 'm1',
        partId: 'p1',
        delta: 'lo',
      }),
    )

    const parts = state.messages[sessionKey({ engineId, sessionId: 's1' })]?.[0]?.parts ?? []
    expect(parts).toEqual([{ id: 'p1', type: 'text', text: 'Hello' }])
  })

  it('upserts a part by id instead of duplicating it', () => {
    let state = loadedState()
    const upsert = (text: string): EngineEventPayload =>
      payload({
        type: 'part.upserted',
        sessionId: 's1',
        messageId: 'm1',
        part: { id: 'p1', type: 'text', text },
      })
    state = applyEngineEvent(state, upsert('a'))
    state = applyEngineEvent(state, upsert('ab'))
    const parts = state.messages[sessionKey({ engineId, sessionId: 's1' })]?.[0]?.parts ?? []
    expect(parts).toHaveLength(1)
    expect(parts[0]).toEqual({ id: 'p1', type: 'text', text: 'ab' })
  })

  it('tracks session run state changes', () => {
    let state = loadedState()
    state = applyEngineEvent(
      state,
      payload({ type: 'session.runState', sessionId: 's1', runState: 'idle' }),
    )
    expect(state.sessions[sessionKey({ engineId, sessionId: 's1' })]?.runState).toBe('idle')
  })

  it('adds and removes pending permission requests', () => {
    const request = {
      id: 'r1',
      sessionId: 's1',
      title: 'node -v',
      kind: 'bash',
      patterns: ['node -v'],
      createdAt: 0,
    }
    let state = applyEngineEvent(loadedState(), payload({ type: 'permission.asked', request }))
    expect(state.pendingPermissions[sessionKey({ engineId, sessionId: 's1' })]).toHaveLength(1)

    state = applyEngineEvent(
      state,
      payload({ type: 'permission.replied', sessionId: 's1', requestId: 'r1' }),
    )
    expect(state.pendingPermissions[sessionKey({ engineId, sessionId: 's1' })]).toBeUndefined()
  })

  it('tolerates events for an unknown session', () => {
    const state = initialWorkbenchState()
    const next = applyEngineEvent(
      state,
      payload({
        type: 'part.delta',
        sessionId: 'missing',
        messageId: 'm1',
        partId: 'p1',
        delta: 'x',
      }),
    )
    expect(next).toBe(state)
  })

  it('drops message events for a session that is not loaded yet', () => {
    const state = initialWorkbenchState()
    const next = applyEngineEvent(
      state,
      payload({ type: 'message.upserted', message: message('m1') }),
    )
    expect(next).toBe(state)
  })

  it('clears the current session when it is deleted', () => {
    const ref = { engineId, sessionId: 's1' }
    const state = loadedState()
    state.ui.current = ref
    const next = applyEngineEvent(state, payload({ type: 'session.deleted', sessionId: 's1' }))
    expect(next.ui.current).toBeNull()
    expect(next.sessions[sessionKey(ref)]).toBeUndefined()
  })
})
