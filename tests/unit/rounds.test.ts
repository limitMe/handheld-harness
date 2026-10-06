import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '../../src/shared/engine'
import { findStuckRound, groupRounds } from '../../src/renderer/src/workbench/rounds'

function message(id: string, role: 'user' | 'assistant'): ChatMessage {
  return {
    id,
    sessionId: 's',
    role,
    createdAt: 0,
    parts: [{ id: `${id}-text`, type: 'text', text: id }],
  }
}

describe('groupRounds', () => {
  it('groups each user message with the replies that follow', () => {
    const rounds = groupRounds([
      message('u1', 'user'),
      message('a1', 'assistant'),
      message('a2', 'assistant'),
      message('u2', 'user'),
      message('a3', 'assistant'),
    ])
    expect(rounds.map((round) => round.id)).toEqual(['u1', 'u2'])
    expect(rounds[0]?.user?.id).toBe('u1')
    expect(rounds[0]?.replies.map((reply) => reply.id)).toEqual(['a1', 'a2'])
    expect(rounds[1]?.replies.map((reply) => reply.id)).toEqual(['a3'])
  })

  it('keeps leading assistant messages in their own round', () => {
    const rounds = groupRounds([message('a0', 'assistant'), message('u1', 'user')])
    expect(rounds.map((round) => round.id)).toEqual(['a0', 'u1'])
    expect(rounds[0]?.user).toBeUndefined()
  })

  it('returns no rounds for an empty transcript', () => {
    expect(groupRounds([])).toEqual([])
  })
})

describe('findStuckRound', () => {
  const rounds = [
    { id: 'r1', top: 0, height: 100 },
    { id: 'r2', top: 100, height: 200 },
    { id: 'r3', top: 300, height: 50 },
  ]

  it('returns the round covering the top edge of the scroll region', () => {
    expect(findStuckRound(rounds, 0)).toBeNull()
    expect(findStuckRound(rounds, 1)).toBe('r1')
    expect(findStuckRound(rounds, 50)).toBe('r1')
    expect(findStuckRound(rounds, 150)).toBe('r2')
    expect(findStuckRound(rounds, 340)).toBe('r3')
  })

  it('returns null once the last round has scrolled past', () => {
    expect(findStuckRound(rounds, 350)).toBeNull()
    expect(findStuckRound(rounds, 400)).toBeNull()
  })
})
