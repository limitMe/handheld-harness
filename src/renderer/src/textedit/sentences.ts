/**
 * Sentence model for the full-screen text editor (spec 17). Pure and
 * framework-free so the splitting, deletion and geometric navigation can be
 * unit tested without the focus tree or the DOM layout.
 */

export interface Sentence {
  /** Sentence text, including its trailing punctuation but no separators. */
  text: string
  /** Index of the first character in the source string. */
  start: number
  /** Index just past the last character of the sentence (before its separators). */
  end: number
}

// Chinese punctuation always breaks; the ASCII set only does so before
// whitespace or at the end, so tokens like `1,000` and `1.2` stay intact.
// Commas and the enumeration comma split too: navigating clause by clause is
// easier on a handheld than walking whole sentences.
const CJK_BREAKS = '。！？；，、'
const ASCII_BREAKS = '.!?;,'
const OPEN_BRACKETS = '（(【[「『《'
const CLOSE_BRACKETS = '）)】]」』》'
const DOUBLE_QUOTES = '“”"'
// ASCII single quotes are contractions ("don't") far more often than quotes, so
// only the typographic pair counts as a wrapper.
const SINGLE_QUOTES = '‘’'

function isWhitespace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r'
}

function isBreak(ch: string, next: string | undefined): boolean {
  if (CJK_BREAKS.includes(ch)) return true
  if (!ASCII_BREAKS.includes(ch)) return false
  // English punctuation only breaks before whitespace or at the end.
  return next === undefined || isWhitespace(next)
}

/**
 * Splits mixed Chinese/English text into sentences (clauses). CJK punctuation
 * always breaks; English punctuation does so only before whitespace or at the
 * end. A line break always splits, and quotes, brackets and backtick code spans
 * are never split. Empty or whitespace-only input yields one empty sentence so
 * the editor always has a focusable line to dictate into.
 */
export function splitSentences(input: string): Sentence[] {
  const sentences: Sentence[] = []
  let buffer = ''
  let start = -1
  let i = 0
  let brackets = 0
  let doubleQuote = false
  let singleQuote = false
  let code = false

  const insideWrapper = (): boolean => brackets > 0 || doubleQuote || singleQuote || code

  const flush = (): void => {
    if (start < 0) return
    const text = buffer.replace(/\s+$/, '')
    if (text.length > 0) sentences.push({ text, start, end: start + text.length })
    buffer = ''
    start = -1
  }

  while (i < input.length) {
    const ch = input[i]!
    if (isWhitespace(ch) && !insideWrapper()) {
      if (start >= 0) {
        if (ch === '\n' || ch === '\r') flush()
        else buffer += ch
      }
      i += 1
      continue
    }
    if (start < 0) start = i
    buffer += ch
    if (ch === '`') code = !code
    else if (DOUBLE_QUOTES.includes(ch)) doubleQuote = !doubleQuote
    else if (SINGLE_QUOTES.includes(ch)) singleQuote = !singleQuote
    else if (OPEN_BRACKETS.includes(ch)) brackets += 1
    else if (CLOSE_BRACKETS.includes(ch)) brackets = Math.max(0, brackets - 1)
    if (!insideWrapper() && isBreak(ch, input[i + 1])) flush()
    i += 1
  }
  flush()

  return sentences.length > 0 ? sentences : [{ text: '', start: 0, end: 0 }]
}

/**
 * The sentence a caret belongs to. A caret exactly on a boundary stays with the
 * previous sentence, so the cursor sits at the end of the text it follows.
 */
export function sentenceIndexAt(
  sentences: Sentence[],
  textLength: number,
  position: number,
): number {
  if (sentences.length === 0) return 0
  for (let i = 0; i < sentences.length; i += 1) {
    const nextStart = i + 1 < sentences.length ? sentences[i + 1]!.start : textLength
    if (position <= nextStart) return i
  }
  return sentences.length - 1
}

/** Minimal layout rectangle for the geometric move (DOM-free). */
export interface RectLike {
  top: number
  bottom: number
  left: number
  right: number
}

export type MoveDirection = 'up' | 'down' | 'left' | 'right'

function inDirection(direction: MoveDirection, dx: number, dy: number): boolean {
  switch (direction) {
    case 'left':
      return dx < 0
    case 'right':
      return dx > 0
    case 'up':
      return dy < 0
    case 'down':
      return dy > 0
  }
}

function scoreLess(a: [number, number, number], b: [number, number, number]): boolean {
  for (let i = 0; i < 3; i += 1) {
    if (a[i]! !== b[i]!) return a[i]! < b[i]!
  }
  return false
}

/**
 * Nearest sentence in a direction, matching how the prose reads on screen: a
 * candidate sharing a band on the perpendicular axis (same line for left/right,
 * same column for up/down) wins over a closer but offset one, then distance
 * along the direction, then distance across it.
 */
export function geometricNeighbor(
  rects: Array<RectLike | null>,
  index: number,
  direction: MoveDirection,
): number {
  const current = rects[index]
  if (!current) return index
  const currentCenterX = current.left + (current.right - current.left) / 2
  const currentCenterY = current.top + (current.bottom - current.top) / 2
  const horizontal = direction === 'left' || direction === 'right'
  let best = index
  let bestScore: [number, number, number] | null = null

  for (let i = 0; i < rects.length; i += 1) {
    if (i === index) continue
    const rect = rects[i]
    if (!rect) continue
    const centerX = rect.left + (rect.right - rect.left) / 2
    const centerY = rect.top + (rect.bottom - rect.top) / 2
    const dx = centerX - currentCenterX
    const dy = centerY - currentCenterY
    if (!inDirection(direction, dx, dy)) continue
    const overlap = horizontal
      ? Math.min(rect.bottom, current.bottom) - Math.max(rect.top, current.top)
      : Math.min(rect.right, current.right) - Math.max(rect.left, current.left)
    const along = horizontal ? Math.abs(dx) : Math.abs(dy)
    const across = horizontal ? Math.abs(dy) : Math.abs(dx)
    const score: [number, number, number] = [overlap > 0 ? 0 : 1, along, across]
    if (!bestScore || scoreLess(score, bestScore)) {
      best = i
      bestScore = score
    }
  }
  return best
}
