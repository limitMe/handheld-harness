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
  currentWork: 'Current work',
  'currentWork.input': 'Current work · Input',
  'currentWork.listInput': 'Current work · List input',
  'currentWork.permission': 'Current work · Permission',
  'currentWork.question': 'Current work · Question',
  taskMap: 'Task map',
  textEdit: 'Text edit',
  systemMenu: 'System menu',
  'systemMenu.picker': 'System menu · Picker',
}

/** Preferred display order; contexts not listed are appended alphabetically. */
const CONTEXT_ORDER = [
  'global',
  'currentWork',
  'currentWork.input',
  'currentWork.listInput',
  'currentWork.permission',
  'currentWork.question',
  'taskMap',
  'textEdit',
  'systemMenu',
  'systemMenu.picker',
]

export function contextLabel(id: string): string {
  return CONTEXT_LABELS[id] ?? id
}

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
  const ids = Object.keys(table).filter((id) => Object.keys(table[id] ?? {}).length > 0)
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

/** Human-readable key for the settings list. */
export function formatBindingKey(key: string, device: MenuDevice): string {
  const { control, phase } = splitControlKey(key)
  if (device === 'keyboard') return control
  return phase === 'hold' ? `${control} (hold)` : control
}
