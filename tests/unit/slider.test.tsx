// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Slider } from '../../src/renderer/src/ui'

afterEach(cleanup)

function stubRect(element: HTMLElement, left: number, width: number): void {
  element.getBoundingClientRect = () =>
    ({
      left,
      width,
      top: 0,
      bottom: 8,
      right: left + width,
      height: 8,
      x: left,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect
}

describe('Slider', () => {
  it('emits a fraction while the track is dragged', () => {
    const onChange = vi.fn()
    render(<Slider value={0} onChange={onChange} />)
    const track = screen.getByTestId('slider')
    stubRect(track, 100, 200)

    fireEvent.pointerDown(track, { clientX: 200, pointerId: 1 })
    expect(onChange).toHaveBeenLastCalledWith(0.5)

    fireEvent.pointerMove(track, { clientX: 300, pointerId: 1 })
    expect(onChange).toHaveBeenLastCalledWith(1)

    fireEvent.pointerUp(track, { clientX: 300, pointerId: 1 })
    fireEvent.pointerMove(track, { clientX: 100, pointerId: 1 })
    expect(onChange).toHaveBeenLastCalledWith(1)
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('is inert without an onChange handler', () => {
    render(<Slider value={0.5} />)
    const track = screen.getByTestId('slider')
    expect(track.getAttribute('role')).toBe('slider')
    expect(track.getAttribute('aria-valuenow')).toBe('50')
  })
})
