// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import StatusBar from '../../src/renderer/src/components/StatusBar'

afterEach(cleanup)

describe('StatusBar', () => {
  it('renders the title, a HH:mm clock and the network state', () => {
    render(<StatusBar title="HANDHELD.AI" />)

    expect(screen.getByTestId('status-title').textContent).toBe('HANDHELD.AI')
    expect(screen.getByTestId('status-time').textContent).toMatch(/^\d{2}:\d{2}$/)
    expect(screen.getByTestId('status-network').textContent).toMatch(/^(online|offline)$/)
  })
})
