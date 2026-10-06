// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ActionHints } from '../../src/renderer/src/hints'

afterEach(cleanup)

describe('ActionHints', () => {
  it('renders press and hold hints with distinct phases', () => {
    render(
      <ActionHints
        entries={[
          { action: 'input.send', control: 'A', phase: 'press' },
          { action: 'voice.dictate', control: 'Y', phase: 'hold' },
        ]}
      />,
    )

    expect(screen.getByText('Send')).not.toBeNull()
    expect(screen.getByText('Dictate')).not.toBeNull()

    const send = screen.getByTestId('action-hints').querySelector('[data-action="input.send"]')
    expect(send?.getAttribute('data-phase')).toBe('press')
    expect(send?.querySelector('[data-testid="hold-ring"]')).toBeNull()
    expect(screen.getByTestId('hold-ring')).not.toBeNull()
  })

  it('fills the hold ring while the control is held', () => {
    render(
      <ActionHints
        entries={[{ action: 'voice.dictate', control: 'Y', phase: 'hold' }]}
        holding={{ control: 'Y', progress: 0.5 }}
      />,
    )

    const ring = screen.getByTestId('hold-ring')
    expect(ring.getAttribute('data-holding')).toBe('true')
    const progressCircle = ring.querySelectorAll('circle')[1]
    expect(Number(progressCircle?.getAttribute('stroke-dashoffset'))).toBeCloseTo(Math.PI * 14)
  })

  it('renders nothing without entries', () => {
    render(<ActionHints entries={[]} />)
    expect(screen.queryByTestId('action-hints')).toBeNull()
  })
})
