// @vitest-environment happy-dom
import { StrictMode, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { SessionRef } from '../../src/shared/engine'
import { DEFAULT_SETTINGS } from '../../src/shared/ipc'
import { FocusProvider } from '../../src/renderer/src/focus'
import { InputProvider } from '../../src/renderer/src/input'
import { useWorkbenchStore } from '../../src/renderer/src/state/store'
import { sessionKey } from '../../src/renderer/src/state/types'
import { TaskMap } from '../../src/renderer/src/workbench/TaskMap'

vi.mock('motion/react', async () => {
  const { createElement } = await import('react')
  const motionOnly = new Set(['initial', 'animate', 'transition', 'whileHover', 'whileTap', 'layout'])
  const strip = (props: Record<string, unknown>): Record<string, unknown> =>
    Object.fromEntries(Object.entries(props).filter(([key]) => !motionOnly.has(key)))
  return {
    motion: {
      div: (props: Record<string, unknown>) => createElement('div', strip(props)),
      button: (props: Record<string, unknown>) => createElement('button', strip(props)),
    },
  }
})

afterEach(() => {
  cleanup()
  delete (window as unknown as { handheld?: unknown }).handheld
})

function installBridge(): void {
  const bridge = {
    settings: {
      get: vi.fn(async () => structuredClone(DEFAULT_SETTINGS)),
      update: vi.fn(async () => structuredClone(DEFAULT_SETTINGS)),
    },
    events: { on: vi.fn(() => () => undefined) },
  }
  ;(window as unknown as { handheld: unknown }).handheld = bridge
}

function ref(id: string): SessionRef {
  return { engineId: 'fake', sessionId: id }
}

function seed(open: SessionRef[], current: SessionRef | null): void {
  useWorkbenchStore.setState({
    sessions: Object.fromEntries(
      open.map((entry) => [
        sessionKey(entry),
        { id: entry.sessionId, title: entry.sessionId, createdAt: 100, updatedAt: 100, runState: 'idle' },
      ]),
    ),
    tasks: { open, unread: {}, watched: {} },
    ui: { current, drafts: {}, openSeq: 0 },
    messages: {},
    messagesLoaded: {},
    pendingPermissions: {},
    pendingQuestions: {},
    engines: {},
    recentModels: [],
    defaultModel: undefined,
  })
}

function MapHarness({ onClose }: { onClose: () => void }) {
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  return (
    <TaskMap
      open
      onClose={onClose}
      modelPickerOpen={modelPickerOpen}
      onModelPickerChange={setModelPickerOpen}
    />
  )
}

function renderMap(onClose: () => void = vi.fn()) {
  return render(
    <StrictMode>
      <InputProvider>
        <FocusProvider>
          <MapHarness onClose={onClose} />
        </FocusProvider>
      </InputProvider>
    </StrictMode>,
  )
}

describe('TaskMap empty card', () => {
  it('focuses a newly created empty card without activating it', async () => {
    installBridge()
    seed([ref('s1')], ref('s1'))
    renderMap()

    await waitFor(() => expect(screen.getByTestId('task-card')).not.toBeNull())
    // The task card opens focused and activated so its hints describe the map.
    expect(screen.getByTestId('task-card').hasAttribute('data-focused')).toBe(true)
    expect(screen.getByTestId('task-card').hasAttribute('data-activated')).toBe(true)

    fireEvent.keyDown(window, { key: 'n' })

    await waitFor(() => expect(screen.getByTestId('task-card-empty')).not.toBeNull())
    const empty = screen.getByTestId('task-card-empty')
    expect(empty.hasAttribute('data-selected')).toBe(true)
    // Focus moves to the new card; the previous card keeps its current-task border.
    expect(empty.hasAttribute('data-focused')).toBe(true)
    expect(screen.getByTestId('task-card').hasAttribute('data-focused')).toBe(false)
    // Activation is a separate concept: the empty card is never auto-activated.
    expect(empty.hasAttribute('data-activated')).toBe(false)
    expect(screen.getByTestId('task-card').hasAttribute('data-activated')).toBe(false)
  })

  it('shows and focuses the empty card when a new task has no session yet', async () => {
    installBridge()
    seed([ref('s1')], null)
    renderMap()

    await waitFor(() => expect(screen.getByTestId('task-card-empty')).not.toBeNull())
    const empty = screen.getByTestId('task-card-empty')
    expect(empty.hasAttribute('data-selected')).toBe(true)
    expect(empty.hasAttribute('data-focused')).toBe(true)
    expect(screen.getByTestId('task-card').hasAttribute('data-focused')).toBe(false)
  })

  it('puts the two button hints inside the empty card, not the bottom legend', async () => {
    installBridge()
    seed([], null)
    renderMap()

    await waitFor(() => expect(screen.getByTestId('task-card-empty')).not.toBeNull())

    const hints = screen.getByTestId('task-card-empty-hints')
    expect(hints.textContent).toContain('Open a recent task')
    expect(hints.textContent).toContain('Choose model: Engine default')
    // The map's own legend is unchanged: it still carries the plain history hint.
    expect(screen.getByText('history')).not.toBeNull()
  })

  it('names the current default model in the card hint', async () => {
    installBridge()
    seed([], null)
    useWorkbenchStore.setState({
      defaultModel: { providerId: 'fake', modelId: 'm1' },
      recentModels: [
        { model: { providerId: 'fake', modelId: 'm1' }, slot: 0, name: 'Fake model' },
      ],
    })
    renderMap()

    await waitFor(() => expect(screen.getByTestId('task-card-empty')).not.toBeNull())
    expect(screen.getByTestId('task-card-empty-hints').textContent).toContain(
      'Choose model: Fake model',
    )
  })

  it('keeps the history hint and no card hints on a selected task card', async () => {
    installBridge()
    seed([ref('s1')], ref('s1'))
    renderMap()

    await waitFor(() => expect(screen.getByTestId('task-card')).not.toBeNull())
    expect(screen.queryByTestId('task-card-empty-hints')).toBeNull()
    expect(screen.getByText('history')).not.toBeNull()
  })

  it('starts a new task when Y is pressed on the empty card', async () => {
    installBridge()
    seed([], null)
    const onClose = vi.fn()
    renderMap(onClose)

    await waitFor(() => expect(screen.getByTestId('task-card-empty')).not.toBeNull())
    expect(screen.getByTestId('task-card-empty').hasAttribute('data-selected')).toBe(true)

    // Y (keyboard N) on the empty card begins the new-task state and closes the map.
    fireEvent.keyDown(window, { key: 'n' })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(useWorkbenchStore.getState().ui.current).toBeNull()
  })

  it('dismisses the empty card on close and falls back to a task card', async () => {
    installBridge()
    seed([ref('s1')], ref('s1'))
    renderMap()

    await waitFor(() => expect(screen.getByTestId('task-card')).not.toBeNull())
    fireEvent.keyDown(window, { key: 'n' })
    await waitFor(() => expect(screen.getByTestId('task-card-empty')).not.toBeNull())
    expect(screen.getByTestId('task-card-empty').hasAttribute('data-selected')).toBe(true)

    // Close (hold B / Delete) removes the empty card and selects the neighbour.
    fireEvent.keyDown(window, { key: 'Delete' })
    await waitFor(() => expect(screen.queryByTestId('task-card-empty')).toBeNull())
    const card = screen.getByTestId('task-card')
    expect(card.hasAttribute('data-selected')).toBe(true)
    expect(card.hasAttribute('data-focused')).toBe(true)
  })
})
