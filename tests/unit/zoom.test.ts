import { describe, expect, it } from 'vitest'
import { clampZoom } from '../../src/main/zoom'

describe('clampZoom', () => {
  it('keeps the factor inside 0.8 - 2.0', () => {
    expect(clampZoom(1)).toBe(1)
    expect(clampZoom(0.5)).toBe(0.8)
    expect(clampZoom(3)).toBe(2)
    expect(clampZoom(1.1)).toBeCloseTo(1.1)
  })

  it('falls back to 1 for non-finite input', () => {
    expect(clampZoom(Number.NaN)).toBe(1)
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(1)
  })
})
