import { ACTION_IDS, splitControlKey, type ActionId } from './actions'
import type { ActionMap, BindingValue } from './input'

/**
 * Pure helpers for the key-binding settings page (spec 15). They operate on the
 * effective `ActionMap` so the UI only has to render and write back a patch.
 */

export type MenuDevice = 'gamepad' | 'keyboard'

/** Human-readable group names; unknown contexts fall back to their id. */
export const CONTEXT_LABELS: Record<string, string> = {
  global: 'Global',
  'global.chrome': 'Global · Shortcuts',
  dictation: 'Dictation',
  currentWork: 'Current work',
  'currentWork.input': 'Current work · Input',
  'currentWork.listInput': 'Current work · List input',
  'currentWork.permission': 'Current work · Permission',
  'currentWork.question': 'Current work · Question',
  cardView: 'Agent card',
  taskMap: 'Task map',
  'taskMap.history': 'Task map · History',
  textEdit: 'Text edit',
  systemMenu: 'System menu',
  'systemMenu.picker': 'System menu · Picker',
  dialog: 'Dialog',
}

/** Preferred display order; contexts not listed are appended alphabetically. */
const CONTEXT_ORDER = [
  'global',
  'global.chrome',
  'dictation',
  'currentWork',
  'currentWork.input',
  'currentWork.listInput',
  'currentWork.permission',
  'currentWork.question',
  'cardView',
  'taskMap',
  'taskMap.history',
  'textEdit',
  'systemMenu',
  'systemMenu.picker',
  'dialog',
]

export function contextLabel(id: string): string {
  return CONTEXT_LABELS[id] ?? id
}

/**
 * Directions are universal (D-pad / stick) and described by the focus ring, so
 * they are not worth rebinding: the key-bindings page leaves them out (spec 15).
 * Select / back are shared by every screen (they appear once, see
 * `SHARED_BINDING_ACTIONS`), and scrolling follows the sticks.
 */
export const HIDDEN_BINDING_ACTIONS: ReadonlySet<ActionId> = new Set<ActionId>([
  'nav.up',
  'nav.down',
  'nav.left',
  'nav.right',
  'nav.activate',
  'nav.deactivate',
  'scroll',
])

/** Screens whose bindings are fixed and never surfaced in settings (spec 15). */
export const HIDDEN_BINDING_CONTEXTS: ReadonlySet<string> = new Set([
  'systemMenu',
  'systemMenu.picker',
  // The model search field is an ephemeral input, not a configurable screen.
  'systemMenu.models',
])

/**
 * Bindings that every screen repeats for the same purpose. The settings page
 * shows them once and fans a rebind out to all the contexts that use them, so
 * select / back stay identical across pages.
 */
export const SHARED_BINDING_ACTIONS: readonly ActionId[] = ['nav.activate', 'nav.deactivate']

export function bindingTable(
  map: ActionMap,
  device: MenuDevice,
): Record<string, Record<string, ActionId>> {
  return device === 'gamepad' ? map.contexts : map.keyboard
}

function actionRank(action: ActionId): number {
  return ACTION_IDS.indexOf(action)
}

export interface BindingRow {
  action: ActionId
  /** Key as stored in the map, e.g. `A`, `B:hold`, `Ctrl+K`. */
  key: string
}

export interface ContextBindings {
  context: string
  rows: BindingRow[]
}

/** Contexts that have at least one binding on the device, in display order. */
export function listContexts(map: ActionMap, device: MenuDevice): string[] {
  const table = bindingTable(map, device)
  const ids = Object.keys(table).filter(
    (id) => !HIDDEN_BINDING_CONTEXTS.has(id) && Object.keys(table[id] ?? {}).length > 0,
  )
  const known = CONTEXT_ORDER.filter((id) => ids.includes(id))
  const extra = ids.filter((id) => !CONTEXT_ORDER.includes(id)).sort()
  return [...known, ...extra]
}

/** Actions bound in one context on the device, sorted by the canonical action order. */
export function listBindings(
  map: ActionMap,
  device: MenuDevice,
  context: string,
): BindingRow[] {
  const table = bindingTable(map, device)[context] ?? {}
  return Object.entries(table)
    .map(([key, action]) => ({ key, action }))
    .sort((a, b) => actionRank(a.action) - actionRank(b.action) || a.key.localeCompare(b.key))
}

export function allContextBindings(map: ActionMap, device: MenuDevice): ContextBindings[] {
  return listContexts(map, device).map((context) => ({
    context,
    rows: listBindings(map, device, context),
  }))
}

export function findKeyForAction(table: Record<string, ActionId> | undefined, action: ActionId): string | undefined {
  if (!table) return undefined
  return Object.keys(table).find((key) => table[key] === action)
}

/** The action that would be shadowed if `newKey` were bound in `context`. */
export function rebindConflict(
  table: Record<string, ActionId> | undefined,
  action: ActionId,
  newKey: string,
): ActionId | null {
  const existing = table?.[newKey]
  if (!existing || existing === action) return null
  return existing
}

export type ConflictResolution = 'overwrite' | 'swap'

/**
 * Builds the per-context override rows for a rebinding. `oldKey` is unbound and
 * `newKey` bound to `action`; when the new key collides, `swap` hands the old
 * key to the conflicting action, `overwrite` leaves it unbound.
 */
export function rebindRows(
  table: Record<string, ActionId> | undefined,
  action: ActionId,
  oldKey: string | undefined,
  newKey: string,
  resolution: ConflictResolution = 'overwrite',
): Record<string, BindingValue> {
  const rows: Record<string, BindingValue> = { [newKey]: action }
  if (!oldKey || oldKey === newKey) return rows
  const conflict = table?.[newKey]
  if (conflict && conflict !== action && resolution === 'swap') {
    rows[oldKey] = conflict
  } else {
    rows[oldKey] = null
  }
  return rows
}

/** Contexts whose device bindings map to `action`. */
export function contextsForAction(
  map: ActionMap,
  device: MenuDevice,
  action: ActionId,
): string[] {
  const table = bindingTable(map, device)
  return Object.keys(table).filter((context) =>
    Object.values(table[context] ?? {}).includes(action),
  )
}

export interface SharedBinding {
  action: ActionId
  /** Key currently bound, taken from the first context that binds the action. */
  key: string | undefined
  /** Contexts a rebind has to update so the key stays identical everywhere. */
  contexts: string[]
}

export function sharedBindings(map: ActionMap, device: MenuDevice): SharedBinding[] {
  const table = bindingTable(map, device)
  return SHARED_BINDING_ACTIONS.map((action) => {
    const contexts = contextsForAction(map, device, action)
    const first = contexts[0]
    return { action, key: first ? findKeyForAction(table[first], action) : undefined, contexts }
  })
}

/** First conflicting action when `newKey` is applied to a shared binding. */
export function sharedConflict(
  map: ActionMap,
  device: MenuDevice,
  action: ActionId,
  newKey: string,
): ActionId | null {
  const table = bindingTable(map, device)
  for (const context of contextsForAction(map, device, action)) {
    const conflict = rebindConflict(table[context], action, newKey)
    if (conflict) return conflict
  }
  return null
}

/** Per-context rows that move a shared binding to `newKey` in every context. */
export function sharedRebindRows(
  map: ActionMap,
  device: MenuDevice,
  action: ActionId,
  oldKey: string | undefined,
  newKey: string,
  resolution: ConflictResolution = 'overwrite',
): Record<string, Record<string, BindingValue>> {
  const table = bindingTable(map, device)
  const rows: Record<string, Record<string, BindingValue>> = {}
  for (const context of contextsForAction(map, device, action)) {
    rows[context] = rebindRows(table[context], action, oldKey, newKey, resolution)
  }
  return rows
}

/** Human-readable key for the settings list. */
export function formatBindingKey(key: string, device: MenuDevice): string {
  const { control, phase } = splitControlKey(key)
  if (device === 'keyboard') return control
  const suffix = phase === 'hold' ? ' (hold)' : ''
  // Sticks resolve by direction: `LStickX+` reads as `LStickX →`.
  if (control.endsWith('+')) return `${control.slice(0, -1)} →${suffix}`
  if (control.endsWith('-')) return `${control.slice(0, -1)} ←${suffix}`
  return `${control}${suffix}`
}
