// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DEFAULT_SETTINGS } from '../../src/shared/ipc'
import type { SpeechProviderId } from '../../src/shared/ipc'
import type { SpeechProviderInfo } from '../../src/shared/speech'
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
  speech: {
    providers: ReturnType<typeof vi.fn>
    keyStatus: ReturnType<typeof vi.fn>
    setKey: ReturnType<typeof vi.fn>
    clearKey: ReturnType<typeof vi.fn>
  }
} {
  const settings = structuredClone(DEFAULT_SETTINGS)
  settings.speech.provider = provider
  const update = vi.fn(async () => settings)
  const clearKey = vi.fn(async () => undefined)
  const speech = {
    providers: vi.fn<() => Promise<SpeechProviderInfo[]>>(async () => [
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
    keyStatus: vi.fn<(providerId: string) => Promise<{ configured: boolean }>>(async () => ({
      configured: true,
    })),
    setKey: vi.fn(async () => undefined),
    clearKey,
  }
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
    engine: { listModels: vi.fn(async () => ({ groups: [] })) },
    window: { setZoom: vi.fn(async () => ({ zoom: 1 })) },
    speech,
  }
  ;(window as unknown as { handheld: unknown }).handheld = bridge
  return { update, clearKey, speech }
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

  it('lists the model picker for Fun-ASR and stores the chosen model', async () => {
    const { update } = installBridge('funasr')
    await openVoicePanel()

    focusRow('voice-resource')
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(screen.getByTestId('choice-fun-asr-realtime')).not.toBeNull())

    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(update).toHaveBeenCalledWith({
      speech: { funasr: { model: 'fun-asr-realtime-2025-11-07' } },
    })
  })

  it('lists the model picker for OpenAI and stores the chosen model', async () => {
    const { update } = installBridge('openai')
    await openVoicePanel()

    focusRow('voice-resource')
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(screen.getByTestId('choice-gpt-live-transcribe')).not.toBeNull())

    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(update).toHaveBeenCalledWith({
      speech: { openai: { model: 'gpt-4o-transcribe' } },
    })
  })

  it('marks only providers that already have a key as configured', async () => {
    const { speech } = installBridge()
    speech.providers.mockResolvedValue([
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
      {
        id: 'funasr',
        displayName: 'Fun-ASR',
        streaming: true,
        languages: ['auto'],
        offline: false,
        requiresCredentials: true,
      },
    ])
    speech.keyStatus.mockImplementation(async (id: string) => ({ configured: id === 'doubao' }))

    await openVoicePanel()
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() =>
      expect(screen.getByTestId('choice-doubao').textContent).toContain('Configured'),
    )
    expect(screen.getByTestId('choice-funasr').textContent).toContain('Requires an API key')
  })
})
