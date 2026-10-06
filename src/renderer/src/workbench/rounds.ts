import type { ChatMessage } from '@shared/engine'

/**
 * One "round" of the conversation: the user message that started it plus every
 * reply that followed, grouped so the user message can stick to the top of the
 * scroll region (spec 13).
 */
export interface MessageRound {
  id: string
  user?: ChatMessage
  replies: ChatMessage[]
}

export function groupRounds(messages: ChatMessage[]): MessageRound[] {
  const rounds: MessageRound[] = []
  for (const message of messages) {
    const startsRound = message.role === 'user' || rounds.length === 0
    if (startsRound) {
      rounds.push({
        id: message.id,
        ...(message.role === 'user' ? { user: message } : {}),
        replies: message.role === 'user' ? [] : [message],
      })
    } else {
      const current = rounds[rounds.length - 1]
      if (current) current.replies.push(message)
    }
  }
  return rounds
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
