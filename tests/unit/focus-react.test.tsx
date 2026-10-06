// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useRef, type ReactNode } from 'react'
import { FocusContainer, FocusProvider, useFocusable } from '../../src/renderer/src/focus'
import type { FocusDirection, NavigateResult } from '../../src/renderer/src/focus'
import { CONTEXT_ORDER, InputProvider, useInputContext } from '../../src/renderer/src/input'

function Item({
  id,
  label,
  activatable,
  onActivate,
  onNavigate,
}: {
  id: string
  label: string
  activatable?: boolean
  onActivate?: () => void
  onNavigate?: (direction: FocusDirection) => NavigateResult | void
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const focus = useFocusable({ id, elementRef: ref, activatable, onActivate, onNavigate })
  return (
    <button ref={ref} {...focus.props} data-testid={id}>
      {label}
    </button>
  )
}

function Harness({ children }: { children: ReactNode }) {
  useInputContext('currentWork', {}, CONTEXT_ORDER.screen)
  return (
    <FocusContainer id="harness" flow="column">
      {children}
    </FocusContainer>
  )
}

function renderHarness(children: ReactNode) {
  return render(
    <InputProvider>
      <FocusProvider>
        <Harness>{children}</Harness>
      </FocusProvider>
    </InputProvider>,
  )
}

beforeEach(() => {
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [] })
})

afterEach(cleanup)

describe('focus tree wiring', () => {
  it('focuses the first node and moves with navigation actions', () => {
    renderHarness(
      <>
        <Item id="first" label="first" />
        <Item id="second" label="second" />
      </>,
    )

    expect(screen.getByTestId('first').hasAttribute('data-focused')).toBe(true)
    expect(screen.getByTestId('second').hasAttribute('data-focused')).toBe(false)

    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(screen.getByTestId('second').hasAttribute('data-focused')).toBe(true)
    expect(screen.getByTestId('first').hasAttribute('data-focused')).toBe(false)
  })

  it('activates on Enter and deactivates on Escape', () => {
    const onActivate = vi.fn()
    renderHarness(<Item id="only" label="only" activatable onActivate={onActivate} />)

    fireEvent.keyDown(window, { key: 'Enter' })
    expect(onActivate).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('only').hasAttribute('data-activated')).toBe(true)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByTestId('only').hasAttribute('data-activated')).toBe(false)
  })

  it('syncs focus tree state to a click', () => {
    renderHarness(
      <>
        <Item id="first" label="first" />
        <Item id="second" label="second" />
      </>,
    )

    fireEvent.focusIn(screen.getByTestId('second'))
    expect(screen.getByTestId('second').hasAttribute('data-focused')).toBe(true)
  })

  it('registers nested siblings before later siblings (parts before the next message)', () => {
    function Group({ label }: { label: string }) {
      return (
        <>
          <Item id={`${label}-a`} label="a" />
          <Item id={`${label}-b`} label="b" />
        </>
      )
    }

    renderHarness(
      <>
        <Group label="one" />
        <Group label="two" />
      </>,
    )

    expect(screen.getByTestId('one-a').hasAttribute('data-focused')).toBe(true)
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(screen.getByTestId('one-b').hasAttribute('data-focused')).toBe(true)
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(screen.getByTestId('two-a').hasAttribute('data-focused')).toBe(true)
  })
})
