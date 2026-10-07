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
    engine: { listModels: vi.fn(async () => []) },
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
  it('adjusts text size with left/right as soon as the row is focused', async () => {
    const { setZoom } = installBridge()
    await openDisplayPanel()

    // No extra activation step: a focused value row enters its internal mode.
    expect(screen.getByTestId('display-zoom').hasAttribute('data-activated')).toBe(true)

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(setZoom).toHaveBeenCalledWith(1.1)
  })

  it('adjusts the hint delay with left/right once focused', async () => {
    const { update } = installBridge()
    await openDisplayPanel()

    // Text size -> hints switch -> hint delay row.
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    await waitFor(() =>
      expect(screen.getByTestId('display-hints-delay').hasAttribute('data-focused')).toBe(true),
    )
    expect(screen.getByTestId('display-hints-delay').hasAttribute('data-activated')).toBe(true)

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(update).toHaveBeenCalledWith({ hints: { delayMs: 2250 } })
  })
})
