// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import StatusBar, { profileBadge } from '../../src/renderer/src/components/StatusBar'

afterEach(cleanup)

interface HandheldScope {
  handheld?: unknown
}

describe('profileBadge', () => {
  it('labels the stable and dev profiles and hides everything else', () => {
    expect(profileBadge('stable')).toBe('STABLE')
    expect(profileBadge('dev')).toBe('DEV')
    expect(profileBadge('default')).toBeNull()
    expect(profileBadge(undefined)).toBeNull()
  })
})

describe('StatusBar', () => {
  it('renders the title, a HH:mm clock and the network state', () => {
    render(<StatusBar title="HANDHELD.AI" />)

    expect(screen.getByTestId('status-title').textContent).toBe('HANDHELD.AI')
    expect(screen.getByTestId('status-time').textContent).toMatch(/^\d{2}:\d{2}$/)
    expect(screen.getByTestId('status-network').textContent).toMatch(/^(online|offline)$/)
  })

  it('shows the STABLE badge when the app reports the stable profile', async () => {
    const scope = globalThis as unknown as HandheldScope
    const previous = scope.handheld
    scope.handheld = {
      app: {
        getInfo: async () => ({
          version: '0.1.0',
          profile: 'stable',
          platform: 'win32',
          isDev: false,
        }),
      },
    }
    try {
      render(<StatusBar title="HANDHELD.AI" />)
      expect((await screen.findByTestId('profile-badge')).textContent).toBe('STABLE')
    } finally {
      scope.handheld = previous
    }
  })
})
