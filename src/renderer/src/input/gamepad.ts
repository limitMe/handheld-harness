import { GAMEPAD_AXES, GAMEPAD_BUTTONS, type GamepadControl } from '@shared/actions'
import type { ControlChange } from './types'

export const DEFAULT_DEADZONE = 0.25
export const BUTTON_PRESS_THRESHOLD = 0.5
/** Ignore analog jitter below this delta while a control stays pressed. */
export const AXIS_EPSILON = 0.05

export interface ControlSample {
  pressed: boolean
  value: number
}

export type ControlStates = Partial<Record<GamepadControl, ControlSample>>

const AXIS_CONTROLS = new Set<string>(GAMEPAD_AXES)

export function isAnalogControl(control: string): boolean {
  return AXIS_CONTROLS.has(control)
}

/** Sticks outside the deadzone keep their sign; values inside snap to zero. */
export function applyDeadzone(value: number, deadzone = DEFAULT_DEADZONE): number {
  return Math.abs(value) < deadzone ? 0 : value
}

export function readGamepadStates(pad: Gamepad, deadzone = DEFAULT_DEADZONE): ControlStates {
  const states: ControlStates = {}
  for (let index = 0; index < GAMEPAD_BUTTONS.length; index += 1) {
    const name = GAMEPAD_BUTTONS[index]
    const button = pad.buttons[index]
    if (!name || !button) continue
    states[name] = {
      pressed: button.value >= BUTTON_PRESS_THRESHOLD,
      value: button.value,
    }
  }
  for (let index = 0; index < GAMEPAD_AXES.length; index += 1) {
    const name = GAMEPAD_AXES[index]
    if (!name) continue
    const value = applyDeadzone(pad.axes[index] ?? 0, deadzone)
    states[name] = { pressed: value !== 0, value }
  }
  return states
}

/** Diffs two frames into edge events plus analog value updates. */
export function diffControlStates(
  previous: ControlStates,
  next: ControlStates,
  epsilon = AXIS_EPSILON,
): ControlChange[] {
  const changes: ControlChange[] = []
  for (const [control, after] of Object.entries(next)) {
    if (!after) continue
    const before = previous[control as GamepadControl]
    if (!before) {
      if (after.pressed || after.value !== 0) {
        changes.push({ control, pressed: after.pressed, value: after.value, source: 'gamepad' })
      }
      continue
    }
    if (after.pressed !== before.pressed) {
      changes.push({ control, pressed: after.pressed, value: after.value, source: 'gamepad' })
      continue
    }
    if (after.pressed && Math.abs(after.value - before.value) >= epsilon) {
      changes.push({
        control,
        pressed: true,
        value: after.value,
        source: 'gamepad',
        valueChanged: true,
      })
    }
  }
  return changes
}
