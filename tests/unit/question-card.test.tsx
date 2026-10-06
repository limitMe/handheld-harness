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

function renderCard(request: QuestionRequest) {
  const onReply = vi.fn()
  const onReject = vi.fn()
  render(
    <InputProvider>
      <FocusProvider>
        <Harness>
          <QuestionCard request={request} onReply={onReply} onReject={onReject} />
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
  it('confirms a single-choice question in one press', () => {
    const { onReply } = renderCard(single())
    fireEvent.click(screen.getByTestId('question-option-0-Option A'))
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
})
