// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { QuestionRequest } from '../../src/shared/engine'
import { FocusContainer, FocusProvider } from '../../src/renderer/src/focus'
import { CONTEXT_ORDER, InputProvider, useInputContext } from '../../src/renderer/src/input'
import { QuestionCard } from '../../src/renderer/src/workbench/QuestionCard'

afterEach(cleanup)

beforeEach(() => {
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [] })
})

function Harness({ children }: { children: ReactNode }) {
  useInputContext('currentWork', {}, CONTEXT_ORDER.screen)
  return (
    <FocusContainer id="test-root" flow="column">
      {children}
    </FocusContainer>
  )
}

function renderCard(request: QuestionRequest, interactive = true) {
  const onReply = vi.fn()
  const onReject = vi.fn()
  render(
    <InputProvider>
      <FocusProvider>
        <Harness>
          <QuestionCard
            request={request}
            interactive={interactive}
            onReply={onReply}
            onReject={onReject}
          />
        </Harness>
      </FocusProvider>
    </InputProvider>,
  )
  return { onReply, onReject }
}

function single(): QuestionRequest {
  return {
    id: 'q1',
    sessionId: 's',
    questions: [
      {
        question: 'Pick one',
        multiple: false,
        options: [{ label: 'Option A' }, { label: 'Option B' }],
      },
    ],
  }
}

function multi(): QuestionRequest {
  return {
    id: 'q2',
    sessionId: 's',
    questions: [
      {
        question: 'Pick many',
        multiple: true,
        options: [{ label: 'Option A' }, { label: 'Option B' }],
      },
    ],
  }
}

describe('QuestionCard', () => {
  it('records a single choice, moves the highlight to Submit, and waits for it', () => {
    const { onReply } = renderCard(single())
    fireEvent.click(screen.getByTestId('question-option-0-Option A'))
    expect(onReply).not.toHaveBeenCalled()
    expect(document.querySelector('[data-highlighted]')?.getAttribute('data-testid')).toBe(
      'question-submit',
    )

    fireEvent.click(screen.getByTestId('question-submit'))
    expect(onReply).toHaveBeenCalledWith([['Option A']])
  })

  it('toggles multi-choice options and waits for Submit', () => {
    const { onReply } = renderCard(multi())
    fireEvent.click(screen.getByTestId('question-option-0-Option A'))
    fireEvent.click(screen.getByTestId('question-option-0-Option B'))
    expect(onReply).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('question-submit'))
    expect(onReply).toHaveBeenCalledWith([['Option A', 'Option B']])
  })

  it('ignores the request', () => {
    const { onReject } = renderCard(single())
    fireEvent.click(screen.getByTestId('question-reject'))
    expect(onReject).toHaveBeenCalledTimes(1)
  })

  it('moves the highlight with the navigation actions', () => {
    renderCard(single())
    const highlighted = () =>
      document.querySelector('[data-highlighted]')?.getAttribute('data-testid')

    expect(highlighted()).toBe('question-option-0-Option A')
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(highlighted()).toBe('question-option-0-Option B')
    fireEvent.keyDown(window, { key: 'ArrowUp' })
    expect(highlighted()).toBe('question-option-0-Option A')
  })

  it('ignores scroll-induced hover and follows real pointer movement', () => {
    renderCard(single())
    const highlighted = () =>
      document.querySelector('[data-highlighted]')?.getAttribute('data-testid')

    // Scrolling can fire `mouseenter`/zero-movement `mousemove` on the option
    // now under a resting cursor; that must not steal the D-pad highlight.
    fireEvent.mouseEnter(screen.getByTestId('question-option-0-Option B'))
    fireEvent.mouseMove(screen.getByTestId('question-option-0-Option B'))
    expect(highlighted()).toBe('question-option-0-Option A')

    fireEvent.mouseMove(screen.getByTestId('question-option-0-Option B'), { movementX: 5 })
    expect(highlighted()).toBe('question-option-0-Option B')
  })

  it('does not consume navigation while inactive (behind an overlay)', () => {
    renderCard(single(), false)
    const highlighted = () =>
      document.querySelector('[data-highlighted]')?.getAttribute('data-testid')

    expect(highlighted()).toBe('question-option-0-Option A')
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(highlighted()).toBe('question-option-0-Option A')
  })
})
