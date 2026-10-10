// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { SessionRef } from '../../src/shared/engine'
import { DEFAULT_SETTINGS } from '../../src/shared/ipc'
import { InputProvider } from '../../src/renderer/src/input'
import { HistoryList } from '../../src/renderer/src/workbench/HistoryList'
import type { HistoryEntry } from '../../src/renderer/src/workbench/taskCards'

function entry(index: number): HistoryEntry {
  const id = `s${index}`
  const ref: SessionRef = { engineId: 'fake', sessionId: id }
  return { ref, summary: { id, title: id, createdAt: 100, updatedAt: 100, runState: 'idle' } }
}

function installBridge(): void {
  ;(window as unknown as { handheld: unknown }).handheld = {
    settings: {
      get: vi.fn(async () => structuredClone(DEFAULT_SETTINGS)),
      update: vi.fn(async () => structuredClone(DEFAULT_SETTINGS)),
    },
    events: { on: vi.fn(() => () => undefined) },
  }
}

afterEach(() => {
  cleanup()
  delete (window as unknown as { handheld?: unknown }).handheld
  vi.restoreAllMocks()
})

describe('HistoryList', () => {
  it('scrolls the highlighted entry into view when navigation moves', async () => {
    installBridge()
    const scrollIntoView = vi.fn()
    HTMLElement.prototype.scrollIntoView = scrollIntoView
    const anchor = document.createElement('div')
    document.body.append(anchor)

    const entries = Array.from({ length: 20 }, (_, index) => entry(index))
    render(
      <InputProvider>
        <HistoryList
          anchor={{ current: anchor }}
          entries={entries}
          onChoose={() => undefined}
          onCancel={() => undefined}
        />
      </InputProvider>,
    )

    await screen.findByTestId('task-history-s0')
    scrollIntoView.mockClear()

    fireEvent.keyDown(window, { key: 'ArrowDown' })
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled())
    expect(screen.getByTestId('task-history-s1').hasAttribute('data-highlighted')).toBe(true)
  })
})
