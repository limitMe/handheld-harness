// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { FocusContainer, FocusProvider } from '../../src/renderer/src/focus'
import { CONTEXT_ORDER, InputProvider, useInputContext } from '../../src/renderer/src/input'
import { FocusableButton } from '../../src/renderer/src/workbench/FocusableButton'
import { Composer } from '../../src/renderer/src/workbench/Composer'

afterEach(cleanup)

beforeEach(() => {
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [] })
})

function Harness({ value }: { value: string }) {
  useInputContext('currentWork', {}, CONTEXT_ORDER.screen)
  return (
    <FocusContainer id="test-root" flow="column">
      <FocusableButton focusId="above" type="button">
        Above
      </FocusableButton>
      <Composer
        value={value}
        onChange={() => undefined}
        onSend={() => undefined}
        onAbort={() => undefined}
        busy={false}
        focusKey="task"
      />
    </FocusContainer>
  )
}

function renderComposer(value = '') {
  render(
    <InputProvider>
      <FocusProvider>
        <Harness value={value} />
      </FocusProvider>
    </InputProvider>,
  )
}

describe('Composer collapse and expand', () => {
  it('collapses to a bar only when unfocused and empty', () => {
    renderComposer()
    expect(screen.getByTestId('composer')).not.toBeNull()

    fireEvent.keyDown(screen.getByTestId('composer'), { key: 'Escape' })
    // Deactivated but still focused: stays expanded (spec 13).
    expect(screen.getByTestId('composer')).not.toBeNull()

    fireEvent.keyDown(window, { key: 'ArrowUp' })
    expect(screen.queryByTestId('composer')).toBeNull()
    expect(screen.getByTestId('composer-collapsed')).not.toBeNull()

    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(screen.getByTestId('composer')).not.toBeNull()
    expect(screen.queryByTestId('composer-collapsed')).toBeNull()
  })

  it('stays expanded but dimmed when unfocused with a draft', () => {
    renderComposer('a draft')
    fireEvent.keyDown(screen.getByTestId('composer'), { key: 'Escape' })
    fireEvent.keyDown(window, { key: 'ArrowUp' })

    const form = screen.getByTestId('composer-form')
    expect(form.hasAttribute('data-expanded')).toBe(true)
    expect(form.className).toContain('opacity-70')
    expect(screen.getByTestId('composer')).not.toBeNull()
  })
})
