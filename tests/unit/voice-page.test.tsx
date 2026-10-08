// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DEFAULT_SETTINGS } from '../../src/shared/ipc'
import type { SpeechProviderId } from '../../src/shared/ipc'
import { FocusProvider } from '../../src/renderer/src/focus'
import { InputProvider } from '../../src/renderer/src/input'
import { SystemMenu } from '../../src/renderer/src/system/SystemMenu'

afterEach(() => {
  cleanup()
  delete (window as unknown as { handheld?: unknown }).handheld
})

function installBridge(provider: SpeechProviderId = 'none'): {
  update: ReturnType<typeof vi.fn>
  clearKey: ReturnType<typeof vi.fn>
} {
  const settings = structuredClone(DEFAULT_SETTINGS)
  settings.speech.provider = provider
  const update = vi.fn(async () => settings)
  const clearKey = vi.fn(async () => undefined)
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
      keyStatus: vi.fn(async () => ({ configured: true })),
      setKey: vi.fn(async () => undefined),
      clearKey,
    },
  }
  ;(window as unknown as { handheld: unknown }).handheld = bridge
  return { update, clearKey }
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

function focusRow(testId: string): void {
  for (let i = 0; i < 20; i += 1) {
    if (screen.getByTestId(testId).hasAttribute('data-focused')) break
    fireEvent.keyDown(window, { key: 'ArrowDown' })
  }
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

  it('opens a model / billing picker instead of cycling with A', async () => {
    const { update } = installBridge('doubao')
    await openVoicePanel()

    focusRow('voice-resource')
    expect(screen.getByTestId('voice-resource').hasAttribute('data-focused')).toBe(true)

    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() =>
      expect(screen.getByTestId('choice-volc.seedasr.sauc.concurrent')).not.toBeNull(),
    )
    expect(update).not.toHaveBeenCalled()

    // The current resource gets the initial focus; step down and confirm.
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(update).toHaveBeenCalledWith({
      speech: { doubao: { resourceId: 'volc.seedasr.sauc.concurrent' } },
    })
  })

  it('asks for confirmation before clearing the API key', async () => {
    const { clearKey } = installBridge('doubao')
    await openVoicePanel()

    focusRow('voice-clear-key')
    expect(screen.getByTestId('voice-clear-key').hasAttribute('data-focused')).toBe(true)

    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Clear API key' })).not.toBeNull(),
    )
    expect(clearKey).not.toHaveBeenCalled()

    // Destructive actions start on Cancel; move right to Confirm.
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(clearKey).toHaveBeenCalledWith('doubao'))
  })
})
