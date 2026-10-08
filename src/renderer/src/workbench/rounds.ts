import type { ChatMessage } from '@shared/engine'
import type { AnsweredChoice } from '../state/types'

/**
 * One "round" of the conversation: the user message that started it plus every
 * reply and mid-round choice that followed, grouped so the user message can
 * stick to the top of the scroll region (spec 13).
 */
export interface MessageRound {
  id: string
  user?: ChatMessage
  entries: RoundEntry[]
}

export type RoundEntry =
  | { type: 'message'; message: ChatMessage }
  | { type: 'choice'; choice: AnsweredChoice }

export type AgentCardKind = 'intermediate' | 'summary'

/** An agent reply card: the mid-round "thinking and actions" or the final summary. */
export interface AgentCard {
  id: string
  kind: AgentCardKind
  messages: ChatMessage[]
}

/** A card in the transcript: an agent reply or a record of what the user chose. */
export type CardBlock =
  | { type: 'agent'; card: AgentCard }
  | { type: 'choice'; choice: AnsweredChoice }

export function groupRounds(
  messages: ChatMessage[],
  choices: AnsweredChoice[] = [],
): MessageRound[] {
  const rounds: MessageRound[] = []
  const pending = [...choices].sort((a, b) => a.anchor - b.anchor)
  let nextChoice = 0

  const flushChoices = (upto: number): void => {
    const round = rounds[rounds.length - 1]
    while (nextChoice < pending.length && (pending[nextChoice]?.anchor ?? 0) <= upto) {
      const choice = pending[nextChoice]
      if (round && choice) round.entries.push({ type: 'choice', choice })
      nextChoice += 1
    }
  }

  messages.forEach((message, index) => {
    // Choices that happened before this message belong to the round already open.
    flushChoices(index)
    if (message.role === 'user') {
      rounds.push({ id: message.id, user: message, entries: [] })
      return
    }
    if (rounds.length === 0) rounds.push({ id: message.id, entries: [] })
    rounds[rounds.length - 1]?.entries.push({ type: 'message', message })
  })
  flushChoices(messages.length)
  return rounds
}

function agentCard(kind: AgentCardKind, messages: ChatMessage[]): AgentCard {
  return { id: `agent-${kind}-${messages[0]?.id ?? 'empty'}`, kind, messages }
}

/**
 * Splits a round's agent output into cards (spec 13). Answered confirmations cut
 * the round into segments; within the last segment the final assistant message
 * is the summary and the rest is the mid-round card. Segments before a choice
 * are always mid-round, so one confirmation yields up to four cards in total
 * (user, mid-round, choice, summary).
 */
export function roundCards(round: MessageRound): CardBlock[] {
  const segments: ChatMessage[][] = [[]]
  const choices: AnsweredChoice[] = []
  for (const entry of round.entries) {
    if (entry.type === 'choice') {
      choices.push(entry.choice)
      segments.push([])
    } else {
      segments[segments.length - 1]?.push(entry.message)
    }
  }

  const blocks: CardBlock[] = []
  segments.forEach((segment, index) => {
    const isLast = index === segments.length - 1
    if (segment.length > 0) {
      if (isLast) {
        const summary = segment[segment.length - 1]
        const earlier = segment.slice(0, -1)
        if (summary) {
          if (earlier.length > 0) blocks.push({ type: 'agent', card: agentCard('intermediate', earlier) })
          blocks.push({ type: 'agent', card: agentCard('summary', [summary]) })
        }
      } else {
        blocks.push({ type: 'agent', card: agentCard('intermediate', segment) })
      }
    }
    const choice = choices[index]
    if (choice) blocks.push({ type: 'choice', choice })
  })
  return blocks
}

export interface RoundGeometry {
  id: string
  /** Offset from the top of the scroll region, in CSS pixels. */
  top: number
  height: number
}

/**
 * Which round currently covers the top edge of the scroll region, if any. That
 * round's user message is the one pinned by `position: sticky`, so it is the
 * only one that collapses (P-18: the width decides the truncation, not a fixed
 * count). Nothing is stuck before the first scroll, hence the strict compare.
 */
export function findStuckRound(rounds: RoundGeometry[], scrollTop: number): string | null {
  for (const round of rounds) {
    if (round.top < scrollTop && round.top + round.height > scrollTop) return round.id
  }
  return null
}
