// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import StatusBar, {
  engineDotClass,
  profileBadge,
} from '../../src/renderer/src/components/StatusBar'

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

describe('engineDotClass', () => {
  it('hides the dot when the engine is ready or unknown and warns otherwise', () => {
    expect(engineDotClass('ready')).toBeNull()
    expect(engineDotClass(undefined)).toBeNull()
    expect(engineDotClass('starting')).toBe('bg-warning')
    expect(engineDotClass('reconnecting')).toBe('bg-warning')
    expect(engineDotClass('down')).toBe('bg-danger')
  })
})

describe('StatusBar', () => {
  it('renders the title, a HH:mm clock and the network state', () => {
    render(<StatusBar title="HANDHELD.AI" />)

    expect(screen.getByTestId('status-title').textContent).toBe('HANDHELD.AI')
    expect(screen.getByTestId('status-time').textContent).toMatch(/^\d{2}:\d{2}$/)
    const network = screen.getByTestId('status-network')
    expect(network.getAttribute('data-status')).toMatch(/^(offline|wifi|cellular|ethernet)$/)
    expect(network.querySelector('svg')).not.toBeNull()
  })

  it('omits the title when the screen has none (text edit)', () => {
    render(<StatusBar />)
    expect(screen.queryByTestId('status-title')).toBeNull()
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
