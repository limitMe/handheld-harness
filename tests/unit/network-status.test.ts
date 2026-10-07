import { describe, expect, it } from 'vitest'
import { resolveNetworkStatus } from '../../src/renderer/src/components/network'

describe('resolveNetworkStatus', () => {
  it('reports offline when the browser is offline or the connection is none', () => {
    expect(resolveNetworkStatus(false, undefined)).toEqual({ kind: 'offline', level: 0 })
    expect(resolveNetworkStatus(true, { type: 'none' })).toEqual({ kind: 'offline', level: 0 })
  })

  it('assumes Wi-Fi on a handheld when the API reports nothing specific', () => {
    expect(resolveNetworkStatus(true, undefined)).toEqual({ kind: 'wifi', level: 3 })
    expect(resolveNetworkStatus(true, { type: 'wifi' })).toEqual({ kind: 'wifi', level: 3 })
  })

  it('maps the effective connection type onto the bar count', () => {
    expect(resolveNetworkStatus(true, { effectiveType: 'slow-2g' }).level).toBe(1)
    expect(resolveNetworkStatus(true, { effectiveType: '2g' }).level).toBe(1)
    expect(resolveNetworkStatus(true, { effectiveType: '3g' }).level).toBe(2)
    expect(resolveNetworkStatus(true, { effectiveType: '4g' }).level).toBe(3)
  })

  it('prefers the downlink estimate over the effective type', () => {
    expect(resolveNetworkStatus(true, { effectiveType: '4g', downlink: 0.5 }).level).toBe(1)
    expect(resolveNetworkStatus(true, { effectiveType: '2g', downlink: 5 }).level).toBe(2)
    expect(resolveNetworkStatus(true, { effectiveType: '2g', downlink: 50 }).level).toBe(3)
  })

  it('distinguishes cellular and wired connections', () => {
    expect(resolveNetworkStatus(true, { type: 'cellular' }).kind).toBe('cellular')
    expect(resolveNetworkStatus(true, { type: 'ethernet' }).kind).toBe('ethernet')
  })
})
