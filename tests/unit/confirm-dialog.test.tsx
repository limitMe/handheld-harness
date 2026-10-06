// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { FocusProvider } from '../../src/renderer/src/focus'
import { CONTEXT_ORDER, InputProvider, useInputContext } from '../../src/renderer/src/input'
import { ConfirmDialog } from '../../src/renderer/src/ui'

afterEach(cleanup)

function Screen({ children }: { children: ReactNode }) {
  useInputContext('currentWork', {}, CONTEXT_ORDER.screen)
  return <>{children}</>
}

function renderDialog() {
  const onOpenChange = vi.fn()
  const onConfirm = vi.fn()
  render(
    <InputProvider>
      <FocusProvider>
        <Screen>
          <ConfirmDialog
            open
            onOpenChange={onOpenChange}
            title="Delete task"
            confirmLabel="Delete"
            destructive
            onConfirm={onConfirm}
          />
        </Screen>
      </FocusProvider>
    </InputProvider>,
  )
  return { onOpenChange, onConfirm }
}

describe('ConfirmDialog', () => {
  it('puts the initial focus on Cancel for a destructive action', () => {
    renderDialog()
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    expect(cancel.hasAttribute('data-focused')).toBe(true)
    expect(screen.getByRole('button', { name: 'Delete' }).hasAttribute('data-focused')).toBe(false)
  })

  it('cancels with B (Escape) instead of confirming', () => {
    const { onOpenChange, onConfirm } = renderDialog()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
