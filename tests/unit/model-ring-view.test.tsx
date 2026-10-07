// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { DEFAULT_SETTINGS } from '../../src/shared/ipc'
import type { RecentModel } from '../../src/shared/model-recents'
import { InputProvider } from '../../src/renderer/src/input'
import { ModelRing, ringSectorFill } from '../../src/renderer/src/workbench/ModelRing'

afterEach(() => {
  cleanup()
  delete (window as unknown as { handheld?: unknown }).handheld
})

function installBridge(): void {
  ;(window as unknown as { handheld: unknown }).handheld = {
    settings: {
      get: vi.fn(async () => structuredClone(DEFAULT_SETTINGS)),
      update: vi.fn(async () => structuredClone(DEFAULT_SETTINGS)),
    },
    events: { on: vi.fn(() => () => undefined) },
  }
}

function entry(id: string, slot: number, name?: string): RecentModel {
  return { model: { providerId: 'fake', modelId: id }, slot, ...(name ? { name } : {}) }
}

function renderRing(
  slots: Array<RecentModel | null>,
  initialSlot: number | null = null,
): void {
  render(
    <InputProvider>
      <ModelRing slots={slots} initialSlot={initialSlot} onConfirm={vi.fn()} onCancel={vi.fn()} />
    </InputProvider>,
  )
}

describe('ModelRing', () => {
  it('renders six sectors and names only the occupied ones', () => {
    installBridge()
    renderRing([entry('a', 0, 'Alpha'), null, null, null, null, entry('b', 5, 'Beta')])

    expect(screen.getAllByTestId(/^model-ring-slot-/)).toHaveLength(6)
    expect(screen.getByText('Alpha')).not.toBeNull()
    expect(screen.getByText('Beta')).not.toBeNull()
  })

  it('highlights the preferred slot, falling back to the first occupied one', () => {
    installBridge()
    renderRing([null, entry('b', 1, 'Beta'), null, null, null, null], 1)
    expect(screen.getByTestId('model-ring-slot-1').hasAttribute('data-selected')).toBe(true)
  })

  it('falls back to the first occupied slot when the preferred one is empty', () => {
    installBridge()
    renderRing([null, null, entry('c', 2, 'Gamma'), null, null, null], 5)
    expect(screen.getByTestId('model-ring-slot-2').hasAttribute('data-selected')).toBe(true)
  })

  it('truncates long model names', () => {
    installBridge()
    renderRing([entry('m', 0, 'A very long model name indeed')])
    expect(screen.getByText('A very long mod…')).not.toBeNull()
  })

  it('shows the stick glyph in the middle so the user knows how to choose', () => {
    installBridge()
    renderRing([entry('a', 0, 'Alpha')])
    expect(screen.getByRole('img', { name: 'RS' })).not.toBeNull()
  })
})

describe('ringSectorFill', () => {
  it('highlights the pointed sector', () => {
    expect(ringSectorFill(true, true)).toBe('fill-accent/35')
  })

  it('greys a pointed empty sector so the wheel still reads as working', () => {
    expect(ringSectorFill(true, false)).toBe('fill-text-muted/25')
  })

  it('keeps unpointed sectors plain', () => {
    expect(ringSectorFill(false, true)).toBe('fill-surface-raised')
    expect(ringSectorFill(false, false)).toBe('fill-surface-raised/50')
  })
})
