import type { SessionRef, SessionSummary } from '@shared/engine'
import { keyParts, sessionKey } from '../state/types'

/**
 * Pure helpers for the task map (spec 14): the card list, selection stepping and
 * the history source. Kept free of React and the store so they can be unit-tested.
 */

export const EMPTY_CARD_ID = '__empty__'

export type TaskCard =
  | { kind: 'task'; id: string; ref: SessionRef }
  | { kind: 'empty'; id: typeof EMPTY_CARD_ID }

export function taskCard(ref: SessionRef): TaskCard {
  return { kind: 'task', id: sessionKey(ref), ref }
}

export const EMPTY_CARD: TaskCard = { kind: 'empty', id: EMPTY_CARD_ID }

/**
 * Open tasks first (creation-time order), then an optional empty card at the far
 * right, where a brand-new task would land (spec 14).
 */
export function buildTaskCards(open: SessionRef[], showEmpty: boolean): TaskCard[] {
  const cards: TaskCard[] = open.map(taskCard)
  if (showEmpty) cards.push(EMPTY_CARD)
  return cards
}

export function initialCardId(cards: TaskCard[], current: SessionRef | null): string {
  if (current) {
    const key = sessionKey(current)
    if (cards.some((card) => card.id === key)) return key
  }
  return cards[0]?.id ?? ''
}

/** Steps selection with wrap-around, so the row reads as a carousel. */
export function stepCardId(cards: TaskCard[], currentId: string, delta: number): string {
  if (cards.length === 0) return currentId
  const index = cards.findIndex((card) => card.id === currentId)
  const from = index < 0 ? 0 : index
  const next = (from + delta + cards.length) % cards.length
  return cards[next]?.id ?? currentId
}

/** One closed task offered by the map's history list. */
export interface HistoryEntry {
  ref: SessionRef
  summary: SessionSummary
}

/** Sessions the map is not already showing, newest first (spec 14 history list). */
export function historyEntries(
  sessions: Record<string, SessionSummary>,
  open: SessionRef[],
): HistoryEntry[] {
  const openKeys = new Set(open.map(sessionKey))
  return Object.entries(sessions)
    .filter(([key]) => !openKeys.has(key))
    .flatMap(([key, summary]) => {
      const ref = keyParts(key)
      return ref ? [{ ref, summary }] : []
    })
    .sort((a, b) => b.summary.updatedAt - a.summary.updatedAt)
}
