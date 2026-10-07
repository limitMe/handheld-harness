// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { GamepadGlyph, hasGamepadGlyph } from '../../src/renderer/src/glyphs'

afterEach(cleanup)

describe('GamepadGlyph', () => {
  it('knows which controls have a dedicated glyph', () => {
    for (const control of ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'LS', 'RS']) {
      expect(hasGamepadGlyph(control)).toBe(true)
    }
    for (const control of ['DpadUp', 'DpadLeft', 'Up', 'Left']) {
      expect(hasGamepadGlyph(control)).toBe(true)
    }
    expect(hasGamepadGlyph('LStickX+')).toBe(false)
    expect(hasGamepadGlyph('Guide')).toBe(false)
  })

  it('falls back to a text key-cap for controls without a glyph', () => {
    render(<GamepadGlyph control="LStickX+" />)
    expect(screen.getByText('LStickX+')).not.toBeNull()
  })

  it('renders a press prompt without a hold ring', () => {
    const { container } = render(<GamepadGlyph control="A" />)
    expect(screen.queryByTestId('hold-ring')).toBeNull()
    expect(container.querySelector('svg .fill-pad-a')).not.toBeNull()
  })

  it('marks hold prompts and fills the ring with the progress', () => {
    render(<GamepadGlyph control="Y" phase="hold" progress={0.25} />)
    const ring = screen.getByTestId('hold-ring')
    expect(ring.getAttribute('data-holding')).toBe('true')
    const progressCircle = ring.querySelectorAll('circle')[1]
    expect(Number(progressCircle?.getAttribute('stroke-dashoffset'))).toBeCloseTo(
      2 * Math.PI * 14 * 0.75,
    )
  })

  it('shows non-face holds as a text prompt instead of a ring', () => {
    render(<GamepadGlyph control="LB" phase="hold" />)
    expect(screen.queryByTestId('hold-ring')).toBeNull()
    expect(screen.getByText('hold')).not.toBeNull()
    expect(screen.getByText('LB')).not.toBeNull()
  })
})
