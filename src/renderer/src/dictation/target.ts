import type { EditResult } from './editor'

/**
 * The text field dictation writes into (spec 16). The composer registers one
 * while its input is focused or activated; anything else means long-press Y is
 * inert (P-05).
 */
export interface DictationTarget {
  /** Current field text. */
  getValue(): string
  /** Current `[start, end]` selection. */
  getSelection(): { start: number; end: number }
  /** Replace the field content and selection. */
  apply(result: EditResult): void
  /** Bring the field into its typing state (spec 11). */
  activate(): void
  isActivated(): boolean
  /** Still mounted; a detached target ends the session. */
  isAlive(): boolean
}
