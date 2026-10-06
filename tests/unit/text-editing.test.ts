import { describe, expect, it } from 'vitest'
import {
  isOnFirstLine,
  lineBounds,
  moveCaretHorizontal,
  moveCaretVertical,
} from '../../src/renderer/src/workbench/textEditing'

describe('isOnFirstLine', () => {
  it('is true before the first newline', () => {
    expect(isOnFirstLine('hello\nworld', 0)).toBe(true)
    expect(isOnFirstLine('hello\nworld', 5)).toBe(true)
  })

  it('is false once a line break precedes the caret', () => {
    expect(isOnFirstLine('hello\nworld', 6)).toBe(false)
  })
})

describe('lineBounds', () => {
  it('returns the current line span', () => {
    expect(lineBounds('one\ntwo\nthree', 4)).toEqual({ start: 4, end: 7 })
    expect(lineBounds('one\ntwo\nthree', 10)).toEqual({ start: 8, end: 13 })
  })
})

describe('moveCaretVertical', () => {
  it('keeps the column when moving between lines', () => {
    const text = 'abcd\nefgh\nijkl'
    // From index 12 (line 3, column 2) up to line 2 column 2.
    expect(moveCaretVertical(text, 12, -1)).toBe(7)
    expect(moveCaretVertical(text, 7, -1)).toBe(2)
  })

  it('stops at the first and last line', () => {
    const text = 'one\ntwo'
    expect(moveCaretVertical(text, 2, -1)).toBe(2)
    expect(moveCaretVertical(text, 6, 1)).toBe(6)
  })

  it('clamps to a shorter target line', () => {
    expect(moveCaretVertical('longline\nx', 7, 1)).toBe(10)
  })
})

describe('moveCaretHorizontal', () => {
  it('clamps to the text bounds', () => {
    expect(moveCaretHorizontal(0, -1, 5)).toBe(0)
    expect(moveCaretHorizontal(5, 1, 5)).toBe(5)
    expect(moveCaretHorizontal(2, 1, 5)).toBe(3)
  })
})
