// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import {
  formatKeyCombo,
  isEditableElement,
  isModifierKey,
  type KeyEventLike,
} from '../../src/renderer/src/input/keyboard'

function keyEvent(key: string, overrides: Partial<KeyEventLike> = {}): KeyEventLike {
  return { key, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...overrides }
}

describe('formatKeyCombo', () => {
  it('canonicalizes modifiers and letter case', () => {
    expect(formatKeyCombo(keyEvent('Escape'))).toBe('Escape')
    expect(formatKeyCombo(keyEvent('k', { ctrlKey: true }))).toBe('Ctrl+K')
    expect(formatKeyCombo(keyEvent('ArrowUp'))).toBe('ArrowUp')
    expect(formatKeyCombo(keyEvent('Backspace', { shiftKey: true }))).toBe('Shift+Backspace')
    expect(formatKeyCombo(keyEvent('K', { ctrlKey: true, shiftKey: true }))).toBe('Ctrl+Shift+K')
  })

  it('identifies modifier-only keys', () => {
    expect(isModifierKey('Control')).toBe(true)
    expect(isModifierKey('Shift')).toBe(true)
    expect(isModifierKey('a')).toBe(false)
  })
})

describe('isEditableElement', () => {
  it('detects native text controls and contenteditable elements', () => {
    expect(isEditableElement(null)).toBe(false)
    expect(isEditableElement(document.createElement('input'))).toBe(true)
    expect(isEditableElement(document.createElement('textarea'))).toBe(true)
    expect(isEditableElement(document.createElement('select'))).toBe(true)
    expect(isEditableElement(document.createElement('button'))).toBe(false)

    const editable = document.createElement('div')
    Object.defineProperty(editable, 'isContentEditable', { value: true })
    expect(isEditableElement(editable)).toBe(true)
  })
})
