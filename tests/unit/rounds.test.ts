import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '../../src/shared/engine'
import type { AnsweredChoice } from '../../src/renderer/src/state/types'
import {
  findStuckRound,
  groupRounds,
  roundCards,
  type MessageRound,
} from '../../src/renderer/src/workbench/rounds'

function message(id: string, role: 'user' | 'assistant'): ChatMessage {
  return {
    id,
    sessionId: 's',
    role,
    createdAt: 0,
    parts: [{ id: `${id}-text`, type: 'text', text: id }],
  }
}

function choice(id: string, anchor: number): AnsweredChoice {
  return {
    id,
    sessionId: 's',
    anchor,
    request: { kind: 'permission', title: id },
    answer: { type: 'permission', reply: 'once' },
  }
}

function agentMessageIds(round: MessageRound): string[][] {
  return roundCards(round).flatMap((block) =>
    block.type === 'agent' ? [block.card.messages.map((message) => message.id)] : [],
  )
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
    expect(rounds[0]?.entries.map((entry) => (entry.type === 'message' ? entry.message.id : entry.choice.id))).toEqual([
      'a1',
      'a2',
    ])
    expect(rounds[1]?.entries.length).toBe(1)
  })

  it('keeps leading assistant messages in their own round', () => {
    const rounds = groupRounds([message('a0', 'assistant'), message('u1', 'user')])
    expect(rounds.map((round) => round.id)).toEqual(['a0', 'u1'])
    expect(rounds[0]?.user).toBeUndefined()
  })

  it('returns no rounds for an empty transcript', () => {
    expect(groupRounds([])).toEqual([])
  })

  it('places an answered choice at its anchor', () => {
    const rounds = groupRounds(
      [message('u1', 'user'), message('a1', 'assistant'), message('a2', 'assistant')],
      [choice('c1', 2)],
    )
    expect(rounds[0]?.entries.map((entry) => entry.type)).toEqual(['message', 'choice', 'message'])
  })

  it('keeps a trailing choice in the round it belongs to', () => {
    const rounds = groupRounds(
      [message('u1', 'user'), message('a1', 'assistant'), message('u2', 'user')],
      [choice('c1', 2)],
    )
    expect(rounds[0]?.entries.at(-1)?.type).toBe('choice')
  })
})

describe('roundCards', () => {
  it('splits into mid-round and summary cards without a choice', () => {
    const [round] = groupRounds([
      message('u1', 'user'),
      message('a1', 'assistant'),
      message('a2', 'assistant'),
    ])
    expect(round).toBeDefined()
    expect(round && agentMessageIds(round)).toEqual([['a1'], ['a2']])
  })

  it('cuts the round into mid-round / choice / summary cards', () => {
    const [round] = groupRounds(
      [message('u1', 'user'), message('a1', 'assistant'), message('a2', 'assistant')],
      [choice('c1', 2)],
    )
    expect(round).toBeDefined()
    if (!round) return
    const blocks = roundCards(round)
    expect(blocks.map((block) => (block.type === 'agent' ? block.card.kind : 'choice'))).toEqual([
      'intermediate',
      'choice',
      'summary',
    ])
  })

  it('makes a single assistant message the summary', () => {
    const [round] = groupRounds([message('u1', 'user'), message('a1', 'assistant')])
    expect(round).toBeDefined()
    if (!round) return
    const blocks = roundCards(round)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.type === 'agent' && blocks[0].card.kind).toBe('summary')
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
