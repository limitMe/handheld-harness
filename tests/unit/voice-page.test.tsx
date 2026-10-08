// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DEFAULT_SETTINGS } from '../../src/shared/ipc'
import { FocusProvider } from '../../src/renderer/src/focus'
import { InputProvider } from '../../src/renderer/src/input'
import { SystemMenu } from '../../src/renderer/src/system/SystemMenu'

afterEach(() => {
  cleanup()
  delete (window as unknown as { handheld?: unknown }).handheld
})

function installBridge(): { update: ReturnType<typeof vi.fn> } {
  const settings = structuredClone(DEFAULT_SETTINGS)
  const update = vi.fn(async () => settings)
  const bridge = {
    settings: {
      get: vi.fn(async () => settings),
      update,
    },
    events: { on: vi.fn(() => () => undefined) },
    app: {
      getInfo: vi.fn(async () => ({
        version: '0.1.0',
        profile: 'test',
        platform: 'win32',
        isDev: true,
      })),
      openExternal: vi.fn(async () => undefined),
      openLogDir: vi.fn(async () => undefined),
    },
    engine: { listModels: vi.fn(async () => []) },
    window: { setZoom: vi.fn(async () => ({ zoom: 1 })) },
    speech: {
      providers: vi.fn(async () => [
        {
          id: 'none',
          displayName: 'None',
          streaming: false,
          languages: [],
          offline: true,
          requiresCredentials: false,
        },
        {
          id: 'doubao',
          displayName: 'Doubao',
          streaming: true,
          languages: ['auto'],
          offline: false,
          requiresCredentials: true,
        },
      ]),
      keyStatus: vi.fn(async () => ({ configured: false })),
      setKey: vi.fn(async () => undefined),
      clearKey: vi.fn(async () => undefined),
    },
  }
  ;(window as unknown as { handheld: unknown }).handheld = bridge
  return { update }
}

// Voice input is the third category in the system menu.
async function openVoicePanel(): Promise<void> {
  render(
    <InputProvider>
      <FocusProvider>
        <SystemMenu open onClose={vi.fn()} onOpenDebug={vi.fn()} />
      </FocusProvider>
    </InputProvider>,
  )
  await waitFor(() => expect(screen.getByTestId('key-bindings')).not.toBeNull())
  fireEvent.keyDown(window, { key: 'ArrowDown' })
  fireEvent.keyDown(window, { key: 'ArrowDown' })
  fireEvent.keyDown(window, { key: 'Enter' })
  await waitFor(() =>
    expect(screen.getByTestId('voice-provider').hasAttribute('data-focused')).toBe(true),
  )
}

describe('Voice input', () => {
  it('opens a provider picker instead of cycling with A', async () => {
    const { update } = installBridge()
    await openVoicePanel()

    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(screen.getByTestId('choice-doubao')).not.toBeNull())
    expect(update).not.toHaveBeenCalled()

    // "None" is the current provider and gets the initial focus; step to Doubao.
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(update).toHaveBeenCalledWith({ speech: { provider: 'doubao' } })
  })
})
