// @vitest-environment happy-dom
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { FocusProvider } from '../../src/renderer/src/focus'
import { InputProvider } from '../../src/renderer/src/input'
import { TextEditOverlay } from '../../src/renderer/src/textedit'
import { useTextEditStore } from '../../src/renderer/src/textedit'

beforeEach(() => {
  useTextEditStore.setState({ open: true, source: '第一句。第二句。第三句。', caret: 0, revision: 0 })
})

afterEach(() => {
  cleanup()
  useTextEditStore.setState({ open: false, source: '', caret: 0, revision: 0 })
  delete (window as unknown as { handheld?: unknown }).handheld
})

function renderEditor(onCommit = vi.fn()) {
  render(
    <StrictMode>
      <InputProvider>
        <FocusProvider>
          <TextEditOverlay onCommit={onCommit} />
        </FocusProvider>
      </InputProvider>
    </StrictMode>,
  )
  return { onCommit }
}

describe('TextEditOverlay', () => {
  it('renders one focusable block per sentence and a caret on the focused one', async () => {
    renderEditor()
    const blocks = screen.getAllByTestId('text-edit-sentence')
    expect(blocks).toHaveLength(3)
    expect(blocks[0]?.textContent).toContain('第一句。')
    await waitFor(() =>
      expect(blocks[0]?.hasAttribute('data-focused')).toBe(true),
    )
    expect(screen.getByTestId('text-edit-caret')).not.toBeNull()
  })

  it('starts focused on the sentence holding the composer caret', async () => {
    useTextEditStore.setState({
      open: true,
      source: '第一句。第二句。第三句。',
      caret: '第一句。第二句。第三句。'.length,
      revision: 0,
    })
    renderEditor()
    await waitFor(() => {
      const focused = document.querySelector(
        '[data-testid="text-edit-sentence"][data-focused]',
      )
      expect(focused?.getAttribute('data-index')).toBe('2')
    })
  })

  it('deletes one character behind the caret with X', async () => {
    useTextEditStore.setState({ open: true, source: 'abc', caret: 3, revision: 0 })
    renderEditor()
    fireEvent.keyDown(window, { key: 'x' })

    await waitFor(() =>
      expect(screen.getAllByTestId('text-edit-sentence')[0]?.textContent).toContain('ab'),
    )
    expect(screen.getAllByTestId('text-edit-sentence')).toHaveLength(1)
  })

  it('commits the edited text and closes on Escape', async () => {
    useTextEditStore.setState({ open: true, source: 'abc', caret: 3, revision: 0 })
    const { onCommit } = renderEditor()
    fireEvent.keyDown(window, { key: 'x' })
    await waitFor(() =>
      expect(screen.getAllByTestId('text-edit-sentence')[0]?.textContent).toContain('ab'),
    )

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCommit).toHaveBeenCalledWith('ab')
    expect(useTextEditStore.getState().open).toBe(false)
  })

  it('edits a single sentence through the native field with A and Enter', async () => {
    renderEditor()
    fireEvent.keyDown(window, { key: 'Enter' })

    const input = await screen.findByTestId('text-edit-input')
    fireEvent.change(input, { target: { value: '改好的句子。' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(screen.queryByTestId('text-edit-input')).toBeNull())
    await waitFor(() =>
      expect(screen.getAllByTestId('text-edit-sentence')[0]?.textContent).toContain('改好的句子。'),
    )
  })
})
