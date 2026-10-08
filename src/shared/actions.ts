/**
 * Semantic actions produced by the input system (spec 10). Device-agnostic:
 * gamepad buttons, sticks and keyboard combos all resolve to one of these ids.
 */

export interface ActionDefinition {
  /** English display name used by action hints (12) and the settings UI (15). */
  readonly label: string
  /** Only repeatable actions emit `repeat` phases while a control is held. */
  readonly repeatable?: boolean
}

export const ACTIONS = {
  'menu.toggle': { label: 'System menu' },
  'map.toggle': { label: 'Task map' },
  'voice.dictate': { label: 'Dictate' },
  'dictation.cancel': { label: 'Cancel dictation' },

  'nav.up': { label: 'Move up', repeatable: true },
  'nav.down': { label: 'Move down', repeatable: true },
  'nav.left': { label: 'Move left', repeatable: true },
  'nav.right': { label: 'Move right', repeatable: true },
  'nav.activate': { label: 'Select' },
  'nav.deactivate': { label: 'Back' },
  scroll: { label: 'Scroll', repeatable: true },

  'input.send': { label: 'Send' },
  'input.deactivate': { label: 'Exit input' },
  'input.listInput': { label: 'List input' },
  'input.textEdit': { label: 'Text edit' },
  'input.deleteBackward': { label: 'Delete character', repeatable: true },
  'edit.commit': { label: 'Save & return' },
  'keyboard.show': { label: 'On-screen keyboard' },

  'permission.once': { label: 'Allow once' },
  'permission.always': { label: 'Always allow' },
  'permission.reject': { label: 'Reject' },

  'question.confirm': { label: 'Confirm' },
  'question.ignore': { label: 'Ignore' },

  'task.open': { label: 'Open task' },
  'map.exit': { label: 'Exit map' },
  'task.close': { label: 'Close task' },
  'task.new': { label: 'New task' },
  'task.history': { label: 'History' },
  'task.model': { label: 'Choose model' },

  'agent.abort': { label: 'Stop agent' },
} as const satisfies Record<string, ActionDefinition>

export type ActionId = keyof typeof ACTIONS

export const ACTION_IDS = Object.keys(ACTIONS) as ActionId[]

export function isActionId(value: string): value is ActionId {
  return Object.hasOwn(ACTIONS, value)
}

export function actionLabel(id: ActionId): string {
  return ACTIONS[id].label
}

export function isRepeatable(id: ActionId): boolean {
  const definition = ACTIONS[id]
  return 'repeatable' in definition && definition.repeatable === true
}

/** Standard-mapping gamepad button names. Guide (index 16) is intentionally omitted: the OS owns it. */
export const GAMEPAD_BUTTONS = [
  'A',
  'B',
  'X',
  'Y',
  'LB',
  'RB',
  'LT',
  'RT',
  'Back',
  'Start',
  'LS',
  'RS',
  'DpadUp',
  'DpadDown',
  'DpadLeft',
  'DpadRight',
] as const

export type GamepadButton = (typeof GAMEPAD_BUTTONS)[number]

export const GAMEPAD_AXES = ['LStickX', 'LStickY', 'RStickX', 'RStickY'] as const

export type GamepadAxis = (typeof GAMEPAD_AXES)[number]

export type GamepadControl = GamepadButton | GamepadAxis

/** Suffixes marking the long-press / explicit press variant of a control, e.g. `B:hold`. */
export const HOLD_SUFFIX = ':hold'
export const PRESS_SUFFIX = ':press'

export type ControlPhase = 'press' | 'hold'

export function splitControlKey(key: string): { control: string; phase: ControlPhase } {
  if (key.endsWith(HOLD_SUFFIX)) {
    return { control: key.slice(0, -HOLD_SUFFIX.length), phase: 'hold' }
  }
  if (key.endsWith(PRESS_SUFFIX)) {
    return { control: key.slice(0, -PRESS_SUFFIX.length), phase: 'press' }
  }
  return { control: key, phase: 'press' }
}
