// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { ChatMessage } from '../../src/shared/engine'
import { FocusProvider } from '../../src/renderer/src/focus'
import { CONTEXT_ORDER, InputProvider, useInputContext } from '../../src/renderer/src/input'
import { MessageList } from '../../src/renderer/src/workbench/MessageList'

afterEach(cleanup)

beforeEach(() => {
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [] })
})

const CLIENT_HEIGHT = 200

/** Emulates a browser's scroll box: setting scrollTop clamps to the content. */
function installScrollBox(element: HTMLElement, height: number): (next: number) => void {
  let contentHeight = height
  let top = 0
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    get: () => contentHeight,
  })
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    get: () => CLIENT_HEIGHT,
  })
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    get: () => top,
    set: (value: number) => {
      top = Math.max(0, Math.min(value, contentHeight - CLIENT_HEIGHT))
    },
  })
  return (next: number) => {
    contentHeight = next
    top = Math.min(top, contentHeight - CLIENT_HEIGHT)
  }
}

function message(id: string, role: 'user' | 'assistant', text: string): ChatMessage {
  return {
    id,
    sessionId: 's',
    role,
    createdAt: 0,
    parts: [{ id: `${id}-part`, type: 'text', text }],
  }
}

const FIRST = [message('u1', 'user', 'hello'), message('a1', 'assistant', 'first answer')]

/** Provides the screen context that binds ArrowUp to `nav.up`. */
function Harness({ children }: { children: ReactNode }) {
  useInputContext('currentWork', {}, CONTEXT_ORDER.screen)
  return <>{children}</>
}

function ui(messages: ChatMessage[], busy = false) {
  return (
    <InputProvider>
      <FocusProvider>
        <Harness>
          <MessageList
            messages={messages}
            permissions={[]}
            questions={[]}
            choices={[]}
            busy={busy}
            viewKey="task:1"
            onReplyPermission={() => undefined}
            onReplyQuestion={() => undefined}
            onRejectQuestion={() => undefined}
          />
        </Harness>
      </FocusProvider>
    </InputProvider>
  )
}

function renderList(messages: ChatMessage[]) {
  const view = render(ui(messages))
  return { ...view, element: screen.getByTestId('message-list') }
}

const listTop = (): number => screen.getByTestId('message-list').scrollTop
const latestButton = (): HTMLElement | null => screen.queryByTestId('scroll-latest')

describe('MessageList live tail', () => {
  it('keeps following when content reflow moves the viewport without user intent', () => {
    const { element, rerender } = renderList(FIRST)
    installScrollBox(element, 1_000)

    rerender(ui([...FIRST, message('a2', 'assistant', 'more')], true))
    expect(listTop()).toBe(800)
    expect(latestButton()).toBeNull()

    // Re-capping a card shifts the viewport up. No gesture asked for this, so
    // the transcript must stay pinned and pull back down on the next update.
    element.scrollTop = 500
    fireEvent.scroll(element)
    expect(latestButton()).toBeNull()

    rerender(ui([...FIRST, message('a2', 'assistant', 'more again')], true))
    expect(listTop()).toBe(800)
    expect(latestButton()).toBeNull()
  })

  it('cancels following on an upward navigation action and resumes from the button', () => {
    const { element, rerender } = renderList(FIRST)
    const setHeight = installScrollBox(element, 1_000)
    element.scrollTop = 800
    fireEvent.scroll(element)
    expect(latestButton()).toBeNull()

    fireEvent.keyDown(window, { key: 'ArrowUp' })
    expect(latestButton()).not.toBeNull()

    // New agent output must not yank the view back while the user reads back.
    rerender(ui([...FIRST, message('a2', 'assistant', 'more')], true))
    expect(listTop()).toBe(800)

    fireEvent.click(screen.getByTestId('scroll-latest'))
    expect(latestButton()).toBeNull()

    // Following stays armed for the rest of the stream.
    setHeight(1_200)
    rerender(ui([...FIRST, message('a2', 'assistant', 'more again')], true))
    expect(listTop()).toBe(1_000)
    expect(latestButton()).toBeNull()
  })

  it('keeps the live tail unpinned after a wheel scroll within the bottom threshold', () => {
    const { element } = renderList(FIRST)
    installScrollBox(element, 1_000)
    element.scrollTop = 800
    fireEvent.scroll(element)

    fireEvent.wheel(element, { deltaY: -10 })
    element.scrollTop = 790
    fireEvent.scroll(element)
    expect(latestButton()).not.toBeNull()

    // Focusing a card can scroll down into the threshold; without a user down
    // gesture it must not re-arm the live tail.
    element.scrollTop = 798
    fireEvent.scroll(element)
    expect(latestButton()).not.toBeNull()

    fireEvent.wheel(element, { deltaY: 10 })
    element.scrollTop = 800
    fireEvent.scroll(element)
    expect(latestButton()).toBeNull()
  })
})
