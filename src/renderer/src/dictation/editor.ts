/**
 * Text-field editing for dictation (spec 16). Keeps the text split around the
 * insertion point so a provisional `partial` can be replaced in place while
 * confirmed `final` segments accumulate behind it.
 */
export interface EditSnapshot {
  value: string
  selectionStart: number
  selectionEnd: number
}

export interface EditResult {
  value: string
  selectionStart: number
  selectionEnd: number
}

export class DictationEditor {
  private readonly before: string
  private readonly after: string
  private readonly original: EditSnapshot
  private committed = ''
  private partialText = ''
  private expectedStart: number
  private expectedEnd: number

  constructor(snapshot: EditSnapshot) {
    this.original = { ...snapshot }
    const start = Math.min(snapshot.selectionStart, snapshot.selectionEnd)
    const end = Math.max(snapshot.selectionStart, snapshot.selectionEnd)
    this.before = snapshot.value.slice(0, start)
    this.after = snapshot.value.slice(end)
    this.expectedStart = this.before.length
    this.expectedEnd = this.before.length
  }

  /** The field after the selection is deleted, with the caret at the insertion point. */
  initial(): EditResult {
    return this.render(false)
  }

  setPartial(text: string): EditResult {
    this.partialText = text
    return this.render(text.length > 0)
  }

  commitFinal(text: string): EditResult {
    this.committed += text
    this.partialText = ''
    return this.render(false)
  }

  /** Promotes any unconfirmed partial text, used when the session ends cleanly. */
  finalize(): EditResult {
    if (this.partialText) {
      this.committed += this.partialText
      this.partialText = ''
    }
    return this.render(false)
  }

  /** Restores the pre-dictation value and selection. */
  undo(): EditResult {
    return {
      value: this.original.value,
      selectionStart: this.original.selectionStart,
      selectionEnd: this.original.selectionEnd,
    }
  }

  /** Selection the field should currently have; used to detect a moved caret. */
  get expectedSelection(): { start: number; end: number } {
    return { start: this.expectedStart, end: this.expectedEnd }
  }

  get committedText(): string {
    return this.committed
  }

  private render(selectPartial: boolean): EditResult {
    const middle = this.committed + this.partialText
    const value = this.before + middle + this.after
    const caret = this.before.length + middle.length
    if (selectPartial && this.partialText.length > 0) {
      this.expectedStart = this.before.length + this.committed.length
      this.expectedEnd = this.expectedStart + this.partialText.length
    } else {
      this.expectedStart = caret
      this.expectedEnd = caret
    }
    return { value, selectionStart: this.expectedStart, selectionEnd: this.expectedEnd }
  }
}
