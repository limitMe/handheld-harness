import { describe, expect, it } from 'vitest'
import type { SessionRef, SessionSummary } from '../../src/shared/engine'
import {
  insertByCreatedAt,
  omitKey,
  sameSessionRef,
  sessionKey,
} from '../../src/renderer/src/state/types'
import {
  buildTaskCards,
  EMPTY_CARD_ID,
  historyEntries,
  initialCardId,
  stepCardId,
} from '../../src/renderer/src/workbench/taskCards'

function ref(id: string, engineId = 'fake'): SessionRef {
  return { engineId, sessionId: id }
}

function summary(id: string, createdAt: number, updatedAt = createdAt): SessionSummary {
  return { id, title: id, createdAt, updatedAt, runState: 'idle' }
}

const sessions: Record<string, SessionSummary> = {
  'fake:a': summary('a', 100),
  'fake:b': summary('b', 200),
  'fake:c': summary('c', 300),
}

describe('task map cards', () => {
  it('puts an optional empty card at the far right', () => {
    const cards = buildTaskCards([ref('a'), ref('b')], true)
    expect(cards.map((card) => card.id)).toEqual(['fake:a', 'fake:b', EMPTY_CARD_ID])
    expect(cards[2]?.kind).toBe('empty')
  })

  it('selects the current task when opening, else the first card', () => {
    const cards = buildTaskCards([ref('a'), ref('b')], false)
    expect(initialCardId(cards, ref('b'))).toBe('fake:b')
    expect(initialCardId(cards, ref('missing'))).toBe('fake:a')
    expect(initialCardId(cards, null)).toBe('fake:a')
  })

  it('selects the empty card for a new unsent task', () => {
    const cards = buildTaskCards([ref('a'), ref('b')], true)
    expect(initialCardId(cards, null)).toBe(EMPTY_CARD_ID)
    // A still-valid current task keeps the selection.
    expect(initialCardId(cards, ref('a'))).toBe('fake:a')
  })

  it('steps with wrap-around so the row reads as a carousel', () => {
    const cards = buildTaskCards([ref('a'), ref('b')], true)
    expect(stepCardId(cards, 'fake:a', 1)).toBe('fake:b')
    expect(stepCardId(cards, EMPTY_CARD_ID, 1)).toBe('fake:a')
    expect(stepCardId(cards, 'fake:a', -1)).toBe(EMPTY_CARD_ID)
  })

  it('lists history newest first and excludes open tasks', () => {
    const entries = historyEntries(sessions, [ref('a')])
    expect(entries.map((entry) => entry.summary.id)).toEqual(['c', 'b'])
    expect(entries[0]?.ref).toEqual(ref('c'))
  })
})

describe('open task ordering', () => {
  it('inserts a reopened task at its original creation-time position', () => {
    const open = [ref('a'), ref('c')]
    expect(insertByCreatedAt(open, ref('b'), sessions).map((entry) => entry.sessionId)).toEqual([
      'a',
      'b',
      'c',
    ])
  })

  it('does not duplicate an already-open task', () => {
    const open = [ref('a')]
    expect(insertByCreatedAt(open, ref('a'), sessions)).toBe(open)
  })

  it('appends when the session summary is unknown', () => {
    const open = [ref('a')]
    expect(insertByCreatedAt(open, ref('zzz'), sessions)).toEqual([ref('a'), ref('zzz')])
  })
})

describe('ref helpers', () => {
  it('compares refs by engine and session', () => {
    expect(sameSessionRef(ref('a'), ref('a'))).toBe(true)
    expect(sameSessionRef(ref('a'), ref('b'))).toBe(false)
    expect(sameSessionRef(null, null)).toBe(true)
    expect(sameSessionRef(ref('a'), null)).toBe(false)
  })

  it('omits a key while keeping identity when it is absent', () => {
    const record = { 'fake:a': true as const }
    expect(omitKey(record, 'fake:b')).toBe(record)
    expect(omitKey(record, 'fake:a')).toEqual({})
  })

  it('round-trips a session key', () => {
    expect(sessionKey(ref('ses_1'))).toBe('fake:ses_1')
  })
})
