/** Pure caret math for the activated composer (spec 11 input rules). */

export function isOnFirstLine(value: string, position: number): boolean {
  const newlineBefore = position > 0 ? value.lastIndexOf('\n', position - 1) : -1
  return newlineBefore === -1
}

export function lineBounds(value: string, position: number): { start: number; end: number } {
  const newlineBefore = position > 0 ? value.lastIndexOf('\n', position - 1) : -1
  const start = newlineBefore + 1
  const nextNewline = value.indexOf('\n', position)
  const end = nextNewline === -1 ? value.length : nextNewline
  return { start, end }
}

/** Moves the caret one visual line up (`delta < 0`) or down, keeping the column. */
export function moveCaretVertical(value: string, position: number, delta: number): number {
  const { start, end } = lineBounds(value, position)
  const column = position - start
  if (delta < 0) {
    if (start === 0) return position
    const previousEnd = start - 1
    const previousStart = lineBounds(value, previousEnd).start
    return Math.min(previousStart + column, previousEnd)
  }
  if (end >= value.length) return position
  const nextStart = end + 1
  const nextEnd = lineBounds(value, nextStart).end
  return Math.min(nextStart + column, nextEnd)
}

export function moveCaretHorizontal(position: number, delta: number, length: number): number {
  return Math.max(0, Math.min(length, position + delta))
}

/**
 * Backspace at the caret: removes the selection, or one character before the
 * caret when nothing is selected. Returns the new text and caret position.
 */
export function deleteBackward(
  value: string,
  start: number,
  end: number,
): { value: string; position: number } {
  if (start !== end) {
    return { value: value.slice(0, start) + value.slice(end), position: start }
  }
  if (start <= 0) return { value, position: 0 }
  return { value: value.slice(0, start - 1) + value.slice(start), position: start - 1 }
}
