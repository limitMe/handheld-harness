// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import type { ChatMessage } from '@shared/engine'
import { FocusContainer, FocusProvider, useFocusable } from '../../src/renderer/src/focus'
import { CONTEXT_ORDER, InputProvider, useInputContext } from '../../src/renderer/src/input'
import { StickyUserMessage } from '../../src/renderer/src/workbench/StickyUserMessage'

function Harness() {
  useInputContext('currentWork', {}, CONTEXT_ORDER.screen)
  return null
}

function Item({ id }: { id: string }) {
  const ref = useRef<HTMLButtonElement>(null)
  const focus = useFocusable({ id, elementRef: ref, order: 2 })
  return <button ref={ref} {...focus.props} data-testid={id} />
}

const message: ChatMessage = {
  id: 'u1',
  sessionId: 's1',
  role: 'user',
  createdAt: 1,
  parts: [{ id: 'p1', type: 'text', text: 'hello there' }],
}

function renderSticky(collapsed: boolean) {
  return render(
    <InputProvider>
      <FocusProvider>
        <Harness />
        <FocusContainer id="harness" flow="column">
          <StickyUserMessage message={message} order={1} collapsed={collapsed} onRestore={() => {}} />
          <Item id="after" />
        </FocusContainer>
      </FocusProvider>
    </InputProvider>,
  )
}

beforeEach(() => {
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [] })
})

afterEach(cleanup)

describe('StickyUserMessage', () => {
  it('expands a collapsed message while it holds focus', () => {
    renderSticky(true)
    // It registers first, so it starts focused and must not stay collapsed.
    expect(screen.getByTestId('sticky-user').hasAttribute('data-collapsed')).toBe(false)
    expect(screen.getByTestId('user-card')).not.toBeNull()
    expect(screen.queryByTestId('user-collapsed-u1')).toBeNull()
  })

  it('collapses again once focus moves on', () => {
    renderSticky(true)
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(screen.getByTestId('sticky-user').hasAttribute('data-collapsed')).toBe(true)
    expect(screen.getByTestId('user-collapsed-u1')).not.toBeNull()
  })

  it('stays expanded when the round is not stuck', () => {
    renderSticky(false)
    expect(screen.getByTestId('sticky-user').hasAttribute('data-collapsed')).toBe(false)
    expect(screen.getByTestId('user-card')).not.toBeNull()
  })
})
