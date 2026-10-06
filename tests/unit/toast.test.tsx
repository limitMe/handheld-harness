// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { showToast, ToastProvider } from '../../src/renderer/src/ui'

afterEach(cleanup)

describe('Toast', () => {
  it('renders notices raised through the global manager', async () => {
    render(<ToastProvider>app</ToastProvider>)

    act(() => {
      showToast('Sent', { description: 'Message queued' })
    })

    const toast = await screen.findByTestId('toast')
    expect(toast.textContent).toContain('Sent')
    expect(toast.textContent).toContain('Message queued')
  })
})
