import { splitControlKey, type ActionId } from '@shared/actions'
import type { ActionMap } from '@shared/input'

/**
 * Action hints (spec 12). The list is derived from the effective ActionMap, so
 * rebinding a control updates the hints without any other changes.
 */
export interface HintEntry {
  action: ActionId
  /** Physical control name as stored in the ActionMap, e.g. `A`, `Y`, `LB`. */
  control: string
  phase: 'press' | 'hold'
}

/**
 * Positional navigation and always-on global chrome are implied by the focus
 * ring and the status bar, so showing them as hints would only add noise.
 */
const HIDDEN_ACTIONS = new Set<ActionId>([
  'nav.up',
  'nav.down',
  'nav.left',
  'nav.right',
  'nav.activate',
  'nav.deactivate',
  'scroll',
  'menu.toggle',
  'map.toggle',
])

export interface HintOptions {
  /**
   * Whether the activated element is a text field. Dictation is only valid at a
   * text cursor (P-05), so its global binding is hidden elsewhere.
   */
  editable?: boolean
}

/**
 * Contexts a hint list is read from: the most specific context (the activated
 * component) plus the global layer. Intermediate screen contexts are skipped so
 * hints describe the component, not the whole screen.
 */
export function hintContextIds(contextIds: string[]): string[] {
  const top = contextIds[0]
  if (!top || top === 'global') return ['global']
  return [top, 'global']
}

/** One entry per action; a more specific context binding wins over a later one. */
export function buildHintEntries(
  map: ActionMap,
  contextIds: string[],
  options: HintOptions = {},
): HintEntry[] {
  const entries: HintEntry[] = []
  const seen = new Set<ActionId>()
  for (const contextId of hintContextIds(contextIds)) {
    const bindings = map.contexts[contextId]
    if (!bindings) continue
    for (const [key, action] of Object.entries(bindings)) {
      if (HIDDEN_ACTIONS.has(action)) continue
      if (action === 'voice.dictate' && !options.editable) continue
      if (seen.has(action)) continue
      seen.add(action)
      const { control, phase } = splitControlKey(key)
      entries.push({ action, control, phase })
    }
  }
  return entries
}
