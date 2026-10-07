import { type ActionId, type ControlPhase, splitControlKey } from './actions'

/** A single binding slot. `null` explicitly unbinds a control inherited from a lower layer. */
export type BindingValue = ActionId | null

/**
 * One configuration layer. Gamepad contexts are keyed by physical control
 * (`A`, `Y:hold`); keyboard entries by key combo (`Escape`, `Ctrl+M`).
 */
export interface BindingLayer {
  contexts: Record<string, Record<string, BindingValue>>
  keyboard: Record<string, Record<string, BindingValue>>
}

/** Effective bindings after merging default, device preset and user layers. */
export interface ActionMap {
  schemaVersion: 1
  contexts: Record<string, Record<string, ActionId>>
  keyboard: Record<string, Record<string, ActionId>>
}

export function emptyBindingLayer(): BindingLayer {
  return { contexts: {}, keyboard: {} }
}

/**
 * Default bindings. Mirrors the key table in docs/specs/README.md.
 * `B`/`B:hold` on the task map follow P-03; permission/question keys follow P-13.
 */
export const DEFAULT_BINDINGS: BindingLayer = {
  contexts: {
    global: {
      Start: 'menu.toggle',
      Back: 'map.toggle',
      'Y:hold': 'voice.dictate',
    },
    currentWork: {
      DpadUp: 'nav.up',
      DpadDown: 'nav.down',
      DpadLeft: 'nav.left',
      DpadRight: 'nav.right',
      RStickY: 'scroll',
      A: 'nav.activate',
      B: 'nav.deactivate',
      'LB:hold': 'agent.abort',
    },
    'currentWork.input': {
      A: 'input.send',
      B: 'input.deactivate',
      LB: 'input.listInput',
      RB: 'input.textEdit',
    },
    'currentWork.listInput': {
      DpadUp: 'nav.up',
      DpadDown: 'nav.down',
      A: 'nav.activate',
      B: 'nav.deactivate',
    },
    'currentWork.permission': {
      A: 'permission.once',
      X: 'permission.always',
      B: 'permission.reject',
    },
    'currentWork.question': {
      DpadUp: 'nav.up',
      DpadDown: 'nav.down',
      A: 'question.confirm',
      B: 'question.ignore',
    },
    taskMap: {
      DpadLeft: 'nav.left',
      DpadRight: 'nav.right',
      A: 'task.open',
      B: 'map.exit',
      'B:hold': 'task.close',
      Y: 'task.new',
      X: 'task.history',
    },
    textEdit: {
      DpadUp: 'nav.up',
      DpadDown: 'nav.down',
      DpadLeft: 'nav.left',
      DpadRight: 'nav.right',
      X: 'sentence.delete',
      'Y:hold': 'voice.dictate',
    },
    systemMenu: {
      DpadUp: 'nav.up',
      DpadDown: 'nav.down',
      DpadLeft: 'nav.left',
      DpadRight: 'nav.right',
      A: 'nav.activate',
      B: 'nav.deactivate',
      Start: 'menu.toggle',
    },
    'systemMenu.picker': {
      DpadUp: 'nav.up',
      DpadDown: 'nav.down',
      A: 'nav.activate',
      B: 'nav.deactivate',
    },
  },
  keyboard: {
    currentWork: {
      ArrowUp: 'nav.up',
      ArrowDown: 'nav.down',
      ArrowLeft: 'nav.left',
      ArrowRight: 'nav.right',
      Enter: 'nav.activate',
      Escape: 'nav.deactivate',
    },
    taskMap: {
      ArrowLeft: 'nav.left',
      ArrowRight: 'nav.right',
      Enter: 'task.open',
      Escape: 'map.exit',
      Delete: 'task.close',
      N: 'task.new',
      H: 'task.history',
    },
    'currentWork.listInput': {
      ArrowUp: 'nav.up',
      ArrowDown: 'nav.down',
      Enter: 'nav.activate',
      Escape: 'nav.deactivate',
    },
    textEdit: {
      ArrowLeft: 'nav.left',
      ArrowRight: 'nav.right',
      X: 'sentence.delete',
    },
    systemMenu: {
      ArrowUp: 'nav.up',
      ArrowDown: 'nav.down',
      ArrowLeft: 'nav.left',
      ArrowRight: 'nav.right',
      Enter: 'nav.activate',
      Escape: 'nav.deactivate',
    },
    'systemMenu.picker': {
      ArrowUp: 'nav.up',
      ArrowDown: 'nav.down',
      Enter: 'nav.activate',
      Escape: 'nav.deactivate',
    },
  },
}

export interface DevicePreset {
  /** Human-readable controller family, for logs and the settings UI. */
  name: string
  /** Substring matched against the Gamepad API `id`. */
  match: string
  bindings: BindingLayer
}

/**
 * Device presets matched by gamepad `id`. The extra buttons on these handhelds
 * are added once their indices are verified on real hardware; until then the
 * presets only reserve the extension point.
 */
export const DEVICE_PRESETS: DevicePreset[] = [
  { name: 'ASUS ROG Ally', match: 'Ally', bindings: emptyBindingLayer() },
  { name: 'Lenovo Legion Go', match: 'Legion Go', bindings: emptyBindingLayer() },
]

export function presetForGamepadId(
  gamepadId: string | undefined,
  presets: DevicePreset[] = DEVICE_PRESETS,
): DevicePreset | undefined {
  if (!gamepadId) return undefined
  return presets.find((preset) => gamepadId.includes(preset.match))
}

function applyLayer(
  target: Record<string, Record<string, ActionId>>,
  source: Record<string, Record<string, BindingValue>>,
): void {
  for (const [context, bindings] of Object.entries(source)) {
    const bucket = (target[context] ??= {})
    for (const [key, value] of Object.entries(bindings)) {
      if (value === null) delete bucket[key]
      else bucket[key] = value
    }
  }
}

/** Applies layers in ascending precedence; the last writer wins, `null` removes. */
export function mergeActionMaps(layers: BindingLayer[]): ActionMap {
  const contexts: Record<string, Record<string, ActionId>> = {}
  const keyboard: Record<string, Record<string, ActionId>> = {}
  for (const layer of layers) {
    applyLayer(contexts, layer.contexts)
    applyLayer(keyboard, layer.keyboard)
  }
  return { schemaVersion: 1, contexts, keyboard }
}

export function resolveActionMap(
  gamepadId: string | undefined,
  user: BindingLayer,
  presets: DevicePreset[] = DEVICE_PRESETS,
): ActionMap {
  const preset = presetForGamepadId(gamepadId, presets)
  return mergeActionMaps([DEFAULT_BINDINGS, preset?.bindings ?? emptyBindingLayer(), user])
}

export interface BindingConflict {
  context: string
  control: string
  phase: ControlPhase
  actions: ActionId[]
}

/**
 * Post-merge check: one context may not bind the same control and press type to
 * more than one action. The record shape makes this impossible from plain JSON,
 * so this guards against future layers that can express duplicate spellings.
 */
export function detectConflicts(
  contexts: Record<string, Record<string, BindingValue>>,
): BindingConflict[] {
  const conflicts: BindingConflict[] = []
  for (const [context, bindings] of Object.entries(contexts)) {
    const groups = new Map<string, ActionId[]>()
    for (const [key, action] of Object.entries(bindings)) {
      if (action === null) continue
      const { control, phase } = splitControlKey(key)
      const groupKey = `${control}\u0000${phase}`
      const group = groups.get(groupKey)
      if (group) group.push(action)
      else groups.set(groupKey, [action])
    }
    for (const [groupKey, actions] of groups) {
      const unique = [...new Set(actions)]
      if (unique.length <= 1) continue
      const [control, phase] = groupKey.split('\u0000') as [string, ControlPhase]
      conflicts.push({ context, control, phase, actions: unique })
    }
  }
  return conflicts
}
