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

function installBridge(): {
  setZoom: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
} {
  const settings = structuredClone(DEFAULT_SETTINGS)
  const setZoom = vi.fn(async () => ({ zoom: 1.1 }))
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
    engine: { listModels: vi.fn(async () => ({ groups: [] })) },
    window: { setZoom },
  }
  ;(window as unknown as { handheld: unknown }).handheld = bridge
  return { setZoom, update }
}

// Text size lives in the "Display & hints" category after the three other tabs.
async function openDisplayPanel(): Promise<void> {
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
  fireEvent.keyDown(window, { key: 'ArrowDown' })
  fireEvent.keyDown(window, { key: 'Enter' })
  await waitFor(() =>
    expect(screen.getByTestId('display-zoom').hasAttribute('data-focused')).toBe(true),
  )
}

describe('Display & hints', () => {
  it('requires A to activate before adjusting a value', async () => {
    const { setZoom } = installBridge()
    await openDisplayPanel()

    const row = screen.getByTestId('display-zoom')
    expect(row.hasAttribute('data-activated')).toBe(false)

    // Moving right while merely focused must not change the value.
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(setZoom).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(row.hasAttribute('data-activated')).toBe(true))
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(setZoom).toHaveBeenCalledWith(1.1)
  })

  it('opens a theme picker and applies the chosen mode', async () => {
    const { update } = installBridge()
    await openDisplayPanel()

    // Text size -> theme.
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    await waitFor(() =>
      expect(screen.getByTestId('display-theme').hasAttribute('data-focused')).toBe(true),
    )

    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(screen.getByTestId('choice-dark')).not.toBeNull())

    // The first option (Follow system) is focused; step down to Dark and confirm.
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(update).toHaveBeenCalledWith({ ui: { theme: 'dark' } })
  })

  it('adjusts the stick scroll speed after activation', async () => {
    const { update } = installBridge()
    await openDisplayPanel()

    // Text size -> theme -> stick scroll speed.
    for (let i = 0; i < 3; i += 1) {
      if (screen.getByTestId('display-scroll-speed').hasAttribute('data-focused')) break
      fireEvent.keyDown(window, { key: 'ArrowDown' })
    }
    await waitFor(() =>
      expect(screen.getByTestId('display-scroll-speed').hasAttribute('data-focused')).toBe(true),
    )

    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() =>
      expect(screen.getByTestId('display-scroll-speed').hasAttribute('data-activated')).toBe(true),
    )
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(update).toHaveBeenCalledWith({ ui: { scrollSpeed: 1.25 } })
  })

  it('adjusts the hint delay after activation', async () => {
    const { update } = installBridge()
    await openDisplayPanel()

    // Text size -> scroll speed -> hints switch -> hint delay row.
    for (let i = 0; i < 5; i += 1) {
      if (screen.getByTestId('display-hints-delay').hasAttribute('data-focused')) break
      fireEvent.keyDown(window, { key: 'ArrowDown' })
    }
    await waitFor(() =>
      expect(screen.getByTestId('display-hints-delay').hasAttribute('data-focused')).toBe(true),
    )

    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() =>
      expect(screen.getByTestId('display-hints-delay').hasAttribute('data-activated')).toBe(true),
    )
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(update).toHaveBeenCalledWith({ hints: { delayMs: 2250 } })
  })

  it('changes the UI language from the picker', async () => {
    const { update } = installBridge()
    await openDisplayPanel()

    // Text size -> theme -> scroll speed -> hints -> delay -> language.
    for (let i = 0; i < 6; i += 1) {
      if (screen.getByTestId('display-language').hasAttribute('data-focused')) break
      fireEvent.keyDown(window, { key: 'ArrowDown' })
    }
    await waitFor(() =>
      expect(screen.getByTestId('display-language').hasAttribute('data-focused')).toBe(true),
    )

    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(screen.getByTestId('choice-zh')).not.toBeNull())
    expect(screen.getByTestId('choice-ja')).not.toBeNull()
    expect(screen.getByTestId('choice-ru')).not.toBeNull()

    // The first option (Follow system) is focused; step down to 简体中文 and confirm.
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(update).toHaveBeenCalledWith({ ui: { language: 'zh' } })
  })
})
