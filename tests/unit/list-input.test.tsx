// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DEFAULT_SETTINGS } from '../../src/shared/ipc'
import { InputProvider } from '../../src/renderer/src/input'
import { ListInput } from '../../src/renderer/src/workbench/ListInput'

afterEach(() => {
  cleanup()
  delete (window as unknown as { handheld?: unknown }).handheld
  vi.restoreAllMocks()
})

describe('ListInput', () => {
  it('truncates a long command description instead of overflowing', async () => {
    const description = 'a very long command description '.repeat(40)
    ;(window as unknown as { handheld: unknown }).handheld = {
      settings: {
        get: async () => ({ input: { contexts: {}, keyboard: {} } }),
        update: async () => undefined,
      },
      events: { on: () => () => undefined },
      engine: {
        listCommands: async () => [{ name: 'compact', description }],
      },
    }
    const anchor = document.createElement('div')
    document.body.append(anchor)

    render(
      <InputProvider>
        <ListInput anchor={anchor} onChoose={() => undefined} onCancel={() => undefined} />
      </InputProvider>,
    )

    const option = await screen.findByTestId('list-input-compact')
    const label = Array.from(option.querySelectorAll('span')).find((span) =>
      span.className.includes('text-code'),
    )
    expect(label?.className).toContain('truncate')
  })

  it('scrolls the highlighted command into view when navigation moves', async () => {
    ;(window as unknown as { handheld: unknown }).handheld = {
      settings: {
        get: vi.fn(async () => structuredClone(DEFAULT_SETTINGS)),
        update: vi.fn(async () => structuredClone(DEFAULT_SETTINGS)),
      },
      events: { on: vi.fn(() => () => undefined) },
      engine: {
        listCommands: async () =>
          Array.from({ length: 20 }, (_, index) => ({ name: `cmd${index}` })),
      },
    }
    const scrollIntoView = vi.fn()
    HTMLElement.prototype.scrollIntoView = scrollIntoView
    const anchor = document.createElement('div')
    document.body.append(anchor)

    render(
      <InputProvider>
        <ListInput anchor={anchor} onChoose={() => undefined} onCancel={() => undefined} />
      </InputProvider>,
    )

    await screen.findByTestId('list-input-cmd0')
    scrollIntoView.mockClear()

    fireEvent.keyDown(window, { key: 'ArrowDown' })
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled())
    expect(screen.getByTestId('list-input-cmd1').hasAttribute('data-highlighted')).toBe(true)
  })
})
