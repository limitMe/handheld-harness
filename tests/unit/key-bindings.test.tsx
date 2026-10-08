// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DEFAULT_SETTINGS } from '../../src/shared/ipc'
import { emptyBindingLayer, resolveActionMap } from '../../src/shared/input'
import { FocusProvider } from '../../src/renderer/src/focus'
import { InputProvider } from '../../src/renderer/src/input'
import { i18n } from '../../src/renderer/src/i18n'
import { KeyBindingsPage } from '../../src/renderer/src/system/KeyBindingsPage'

afterEach(cleanup)

function renderPage(): void {
  const map = resolveActionMap(undefined, emptyBindingLayer())
  render(
    <InputProvider>
      <FocusProvider>
        <KeyBindingsPage
          map={map}
          settings={structuredClone(DEFAULT_SETTINGS)}
          update={vi.fn(async () => undefined)}
        />
      </FocusProvider>
    </InputProvider>,
  )
}

function promptFor(key: string, action: string, defaultValue: string): string {
  return i18n.t(key, {
    device: i18n.t('keys.deviceButton'),
    action: i18n.t(`actions.${action}`, { defaultValue }),
  })
}

describe('KeyBindingsPage capture copy', () => {
  it('warns that a hold binding stays a long-press after rebinding', async () => {
    renderPage()
    // `agent.abort` is bound to `LB:hold`, so the capture keeps the hold phase.
    fireEvent.click(screen.getByTestId('binding-currentWork-agent.abort'))

    const expected = promptFor('keys.capturePromptHold', 'agent.abort', 'Stop agent')
    await waitFor(() => expect(screen.getByText(expected)).not.toBeNull())
  })

  it('keeps the plain press copy for a press binding', async () => {
    renderPage()
    fireEvent.click(screen.getByTestId('binding-currentWork.permission-permission.once'))

    const expected = promptFor('keys.capturePrompt', 'permission.once', 'Allow once')
    await waitFor(() => expect(screen.getByText(expected)).not.toBeNull())
  })

  it('cancels a keyboard capture with Escape and names that key', async () => {
    renderPage()
    fireEvent.click(screen.getByTestId('keys-device-keyboard'))
    fireEvent.click(screen.getByTestId('binding-taskMap-task.new'))
    await waitFor(() => expect(screen.getByTestId('capture-banner')).not.toBeNull())

    // The hint must name the keyboard cancel key, not the gamepad Start button.
    expect(screen.getByTestId('capture-banner').textContent).toContain('Esc')
    expect(screen.getByTestId('capture-banner').textContent).not.toContain('Start')

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByTestId('capture-banner')).toBeNull())
  })
})
