export interface KeyEventLike {
  key: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
}

const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta'])

export function isModifierKey(key: string): boolean {
  return MODIFIER_KEYS.has(key)
}

/**
 * Canonical combo string used in action maps, e.g. `Escape`, `Ctrl+K`,
 * `Shift+Backspace`. Letter keys are upper-cased so the binding is stable
 * regardless of Caps Lock or Shift.
 */
export function formatKeyCombo(event: KeyEventLike): string {
  const parts: string[] = []
  if (event.ctrlKey) parts.push('Ctrl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  if (event.metaKey) parts.push('Meta')
  parts.push(event.key.length === 1 ? event.key.toUpperCase() : event.key)
  return parts.join('+')
}

export function isEditableElement(element: Element | null): boolean {
  if (!element) return false
  const tag = element.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return element instanceof HTMLElement && element.isContentEditable
}
