import type { ActionId } from '@shared/actions'
import type { SoundName } from './player'

/** Moving between cards or menu items with the D-pad. */
const SCROLL_ACTIONS = new Set<ActionId>(['nav.up', 'nav.down', 'nav.left', 'nav.right'])

/** Confirming, opening a screen or sending: one shared "go" cue. */
const SELECT_ACTIONS = new Set<ActionId>([
  'nav.activate',
  'input.send',
  'map.toggle',
  'menu.toggle',
  'task.open',
  'task.model',
  'task.history',
  'input.listInput',
  'input.textEdit',
  'edit.commit',
  'permission.once',
  'permission.always',
  'question.confirm',
])

/** Backing out of a screen or dialog: one shared "back" cue. */
const BACK_ACTIONS = new Set<ActionId>([
  'nav.deactivate',
  'map.exit',
  'input.deactivate',
  'permission.reject',
  'question.ignore',
])

export type ActionPhase = 'start' | 'repeat' | 'end'

/**
 * The analog `scroll` action fires on every frame the stick is deflected; its
 * feedback is throttled to roughly the discrete D-pad cadence so it reads as a
 * sequence of ticks rather than one continuous tone.
 */
export const SCROLL_SOUND_INTERVAL_MS = 80

export interface SoundCue {
  name: SoundName
  /** Whether a held control keeps retriggering the cue. */
  repeats: boolean
}

/** Maps a discrete action to its sound cue, or null for silent actions. */
export function cueFor(action: ActionId): SoundCue | null {
  if (action === 'input.deleteBackward') return { name: 'delete', repeats: true }
  if (SCROLL_ACTIONS.has(action)) return { name: 'scroll', repeats: true }
  if (SELECT_ACTIONS.has(action)) return { name: 'select', repeats: false }
  if (BACK_ACTIONS.has(action)) return { name: 'back', repeats: false }
  return null
}

export interface CueDecision {
  play: SoundName
  /** Set to `now` when the returned cue is the analog scroll, to feed back in. */
  scrollAt?: number
}

/**
 * Resolves the cue for one routed action event. `lastScrollAt` is the time the
 * last scroll cue played; pass the previous decision's `scrollAt` back in.
 */
export function resolveCue(
  action: ActionId,
  phase: ActionPhase,
  value: number | undefined,
  now: number,
  lastScrollAt: number,
): CueDecision | null {
  if (phase === 'end') return null

  if (action === 'scroll') {
    if (!value) return null
    if (phase !== 'start' && now - lastScrollAt < SCROLL_SOUND_INTERVAL_MS) return null
    return { play: 'scroll', scrollAt: now }
  }

  const cue = cueFor(action)
  if (!cue) return null
  if (phase === 'repeat' && !cue.repeats) return null
  return { play: cue.name }
}
