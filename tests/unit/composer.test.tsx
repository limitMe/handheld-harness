// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Composer } from '../../src/renderer/src/workbench/Composer'

afterEach(cleanup)

function setup(value = 'hello') {
  const onSend = vi.fn()
  const onAbort = vi.fn()
  render(
    <Composer
      value={value}
      onChange={() => undefined}
      onSend={onSend}
      onAbort={onAbort}
      busy={false}
      focusKey="task"
    />,
  )
  return { onSend, onAbort, textarea: screen.getByTestId('composer') }
}

describe('Composer', () => {
  it('sends on Enter and not while an IME is composing', () => {
    const { onSend, textarea } = setup()
    fireEvent.keyDown(textarea, { key: 'Enter', isComposing: true })
    expect(onSend).not.toHaveBeenCalled()

    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it('inserts a newline instead of sending on Shift+Enter', () => {
    const { onSend, textarea } = setup()
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('shows Stop while busy and aborts on Escape', () => {
    const onAbort = vi.fn()
    render(
      <Composer
        value=""
        onChange={() => undefined}
        onSend={() => undefined}
        onAbort={onAbort}
        busy
        focusKey="task"
      />,
    )
    expect(screen.getByTestId('stop-button')).not.toBeNull()
    fireEvent.keyDown(screen.getByTestId('composer'), { key: 'Escape' })
    expect(onAbort).toHaveBeenCalledTimes(1)
  })
})
