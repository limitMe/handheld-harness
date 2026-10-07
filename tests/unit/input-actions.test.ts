import { describe, expect, it } from 'vitest'
import {
  ACTION_IDS,
  GAMEPAD_BUTTONS,
  actionLabel,
  isActionId,
  isRepeatable,
  repeatIntervalFor,
  splitControlKey,
} from '../../src/shared/actions'

describe('action registry', () => {
  it('has a non-empty English label for every action', () => {
    for (const id of ACTION_IDS) {
      const label = actionLabel(id)
      expect(label.length).toBeGreaterThan(0)
      expect(/[\u4e00-\u9fff]/.test(label)).toBe(false)
    }
  })

  it('marks only navigation and scroll as repeatable', () => {
    for (const id of ['nav.up', 'nav.down', 'nav.left', 'nav.right', 'scroll'] as const) {
      expect(isRepeatable(id)).toBe(true)
    }
    expect(isRepeatable('input.send')).toBe(false)
    expect(isRepeatable('task.close')).toBe(false)
  })

  it('gives scroll a slower repeat cadence, others the fallback', () => {
    expect(repeatIntervalFor('scroll', 60)).toBe(120)
    expect(repeatIntervalFor('nav.down', 60)).toBe(60)
    expect(repeatIntervalFor('input.send', 60)).toBe(60)
  })

  it('validates action ids', () => {
    expect(isActionId('menu.toggle')).toBe(true)
    expect(isActionId('nope')).toBe(false)
  })

  it('splits control keys into control and press phase', () => {
    expect(splitControlKey('B')).toEqual({ control: 'B', phase: 'press' })
    expect(splitControlKey('B:hold')).toEqual({ control: 'B', phase: 'hold' })
  })

  it('excludes Guide from the mappable buttons', () => {
    expect(GAMEPAD_BUTTONS).not.toContain('Guide')
    expect(GAMEPAD_BUTTONS).toHaveLength(16)
  })
})
