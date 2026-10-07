// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { motionTokens } from '../../src/renderer/src/motion'

describe('motion tokens', () => {
  it('falls back to the documented token values when CSS variables are unavailable', () => {
    const tokens = motionTokens()
    expect(tokens).toEqual({
      fast: 0.12,
      ui: 0.22,
      scene: 0.45,
      ease: [0.2, 0, 0, 1],
    })
  })
})
