import { describe, expect, it } from 'vitest'
import {
  geometricNeighbor,
  sentenceIndexAt,
  splitSentences,
  type RectLike,
} from '../../src/renderer/src/textedit/sentences'

describe('splitSentences', () => {
  it('splits on Chinese terminators and keeps the punctuation', () => {
    const sentences = splitSentences('第一句。第二句！第三句？')
    expect(sentences.map((sentence) => sentence.text)).toEqual(['第一句。', '第二句！', '第三句？'])
    expect(sentences[0]).toEqual({ text: '第一句。', start: 0, end: 4 })
    expect(sentences[2]).toEqual({ text: '第三句？', start: 8, end: 12 })
  })

  it('splits English punctuation only before whitespace or at the end', () => {
    expect(splitSentences('Hello world. Next one! And done?').map((s) => s.text)).toEqual([
      'Hello world.',
      'Next one!',
      'And done?',
    ])
    // A dot inside a token is not a sentence boundary.
    expect(splitSentences('version 1.2 ships.').map((s) => s.text)).toEqual(['version 1.2 ships.'])
  })

  it('always splits on a line break', () => {
    expect(splitSentences('line one\nline two').map((s) => s.text)).toEqual(['line one', 'line two'])
    expect(splitSentences('a。\r\nb。').map((s) => s.text)).toEqual(['a。', 'b。'])
  })

  it('never splits inside quotes, brackets or code spans', () => {
    expect(splitSentences('他说：“你好。再见。”').map((s) => s.text)).toEqual([
      '他说：“你好。再见。”',
    ])
    expect(splitSentences('（a。b）c。').map((s) => s.text)).toEqual(['（a。b）c。'])
    expect(splitSentences('run `echo hi. there` now. done.').map((s) => s.text)).toEqual([
      'run `echo hi. there` now.',
      'done.',
    ])
  })

  it('keeps contractions intact and leading separators out', () => {
    expect(splitSentences("don't stop. go.").map((s) => s.text)).toEqual(["don't stop.", 'go.'])
    expect(splitSentences('  \n  hello  ').map((s) => s.text)).toEqual(['hello'])
  })

  it('returns one empty sentence for empty or whitespace input', () => {
    expect(splitSentences('')).toEqual([{ text: '', start: 0, end: 0 }])
    expect(splitSentences('   \n ')).toEqual([{ text: '', start: 0, end: 0 }])
  })
})

describe('sentenceIndexAt', () => {
  const sentences = splitSentences('第一句。第二句！第三句？')

  it('keeps a boundary caret with the previous sentence', () => {
    expect(sentenceIndexAt(sentences, 12, 0)).toBe(0)
    expect(sentenceIndexAt(sentences, 12, 4)).toBe(0)
    expect(sentenceIndexAt(sentences, 12, 8)).toBe(1)
    expect(sentenceIndexAt(sentences, 12, 12)).toBe(2)
  })
})

describe('geometricNeighbor', () => {
  const rect = (top: number, left = 0): RectLike => ({
    top,
    bottom: top + 20,
    left,
    right: left + 100,
  })

  it('moves to the nearest sentence below or above', () => {
    const rects = [rect(0), rect(30), rect(60)]
    expect(geometricNeighbor(rects, 0, 'down')).toBe(1)
    expect(geometricNeighbor(rects, 1, 'down')).toBe(2)
    expect(geometricNeighbor(rects, 2, 'up')).toBe(1)
    expect(geometricNeighbor(rects, 0, 'up')).toBe(0)
  })

  it('prefers a candidate on the same line for left/right', () => {
    // index 1 sits on the next line but further right; index 0 is on this line.
    const rects = [rect(0, 0), rect(30, 200), rect(0, 120)]
    expect(geometricNeighbor(rects, 0, 'right')).toBe(2)
    expect(geometricNeighbor(rects, 2, 'left')).toBe(0)
  })

  it('prefers a candidate sharing a band for up/down', () => {
    const rects = [rect(0, 0), rect(30, 300), rect(30, 0)]
    expect(geometricNeighbor(rects, 0, 'down')).toBe(2)
  })
})
