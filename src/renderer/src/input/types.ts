import type { ActionId } from '@shared/actions'

export type InputSource = 'gamepad' | 'keyboard'

export type ActionPhase = 'start' | 'repeat' | 'end'

/** A semantic action emitted by the normalization pipeline. */
export interface InputActionEvent {
  action: ActionId
  phase: ActionPhase
  source: InputSource
  /** Physical control that produced it: a gamepad control name or a keyboard combo. */
  control: string
  /** Analog value for sticks (negative is up/left depending on the axis). */
  value?: number
}

/** One control edge or analog update for a single frame. */
export interface ControlChange {
  control: string
  pressed: boolean
  value: number
  source: InputSource
  /** True when only the analog value changed while the control stayed pressed. */
  valueChanged?: boolean
}

export interface CapturedControl {
  source: InputSource
  control: string
}
