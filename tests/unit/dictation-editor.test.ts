import { describe, expect, it } from 'vitest'
import { DictationEditor } from '../../src/renderer/src/dictation/editor'

describe('DictationEditor', () => {
  it('deletes the current selection and puts the caret at the insertion point', () => {
    const editor = new DictationEditor({ value: 'abcXYZdef', selectionStart: 3, selectionEnd: 6 })
    expect(editor.initial()).toEqual({ value: 'abcdef', selectionStart: 3, selectionEnd: 3 })
  })

  it('previews a partial at the insertion point and selects it', () => {
    const editor = new DictationEditor({ value: 'hello world', selectionStart: 5, selectionEnd: 5 })
    editor.initial()

    expect(editor.setPartial(' you')).toEqual({
      value: 'hello you world',
      selectionStart: 5,
      selectionEnd: 9,
    })
    expect(editor.expectedSelection).toEqual({ start: 5, end: 9 })
  })

  it('replaces the previous partial with the next one', () => {
    const editor = new DictationEditor({ value: '', selectionStart: 0, selectionEnd: 0 })
    editor.setPartial('你')
    expect(editor.setPartial('你好').value).toBe('你好')
  })

  it('commits a final after the partial and moves the caret past it', () => {
    const editor = new DictationEditor({ value: '', selectionStart: 0, selectionEnd: 0 })
    editor.setPartial('hel')
    expect(editor.commitFinal('hello')).toEqual({ value: 'hello', selectionStart: 5, selectionEnd: 5 })
    expect(editor.committedText).toBe('hello')
  })

  it('accumulates several finals and keeps the trailing text', () => {
    const editor = new DictationEditor({ value: 'tail', selectionStart: 0, selectionEnd: 0 })
    editor.commitFinal('one ')
    editor.commitFinal('two ')
    expect(editor.initial().value).toBe('one two tail')
    expect(editor.finalize()).toEqual({ value: 'one two tail', selectionStart: 8, selectionEnd: 8 })
  })

  it('promotes a pending partial when the session ends without a final', () => {
    const editor = new DictationEditor({ value: '', selectionStart: 0, selectionEnd: 0 })
    editor.setPartial('dangling')
    expect(editor.finalize().value).toBe('dangling')
    expect(editor.committedText).toBe('dangling')
  })

  it('restores the pre-dictation value and selection on undo', () => {
    const editor = new DictationEditor({ value: 'abcXYZdef', selectionStart: 3, selectionEnd: 6 })
    editor.initial()
    editor.setPartial('spoken')
    expect(editor.undo()).toEqual({ value: 'abcXYZdef', selectionStart: 3, selectionEnd: 6 })
  })
})
