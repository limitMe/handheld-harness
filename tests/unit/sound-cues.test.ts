import { describe, expect, it } from 'vitest'
import { SCROLL_SOUND_INTERVAL_MS, resolveCue } from '../../src/renderer/src/sound/cues'

describe('sound cues', () => {
  it('maps discrete navigation and actions', () => {
    expect(resolveCue('nav.down', 'start', undefined, 0, 0)?.play).toBe('scroll')
    expect(resolveCue('nav.activate', 'start', undefined, 0, 0)?.play).toBe('select')
    expect(resolveCue('input.send', 'start', undefined, 0, 0)?.play).toBe('select')
    expect(resolveCue('nav.deactivate', 'start', undefined, 0, 0)?.play).toBe('back')
    expect(resolveCue('input.deleteBackward', 'start', undefined, 0, 0)?.play).toBe('delete')
  })

  it('stays silent for unmapped actions and end phases', () => {
    expect(resolveCue('agent.abort', 'start', undefined, 0, 0)).toBeNull()
    expect(resolveCue('nav.activate', 'end', undefined, 0, 0)).toBeNull()
  })

  it('does not retrigger one-shot cues on repeat', () => {
    expect(resolveCue('nav.activate', 'repeat', undefined, 0, 0)).toBeNull()
    expect(resolveCue('nav.down', 'repeat', undefined, 0, 0)?.play).toBe('scroll')
    expect(resolveCue('input.deleteBackward', 'repeat', undefined, 0, 0)?.play).toBe('delete')
  })

  it('throttles the analog scroll action but fires immediately on start', () => {
    const first = resolveCue('scroll', 'start', 0.8, 1000, 0)
    expect(first).toEqual({ play: 'scroll', scrollAt: 1000 })

    const tooSoon = 1000 + SCROLL_SOUND_INTERVAL_MS - 1
    expect(resolveCue('scroll', 'repeat', 0.8, tooSoon, 1000)).toBeNull()

    const due = 1000 + SCROLL_SOUND_INTERVAL_MS
    expect(resolveCue('scroll', 'repeat', 0.8, due, 1000)).toEqual({
      play: 'scroll',
      scrollAt: due,
    })

    // Centered stick (no deflection) never sounds.
    expect(resolveCue('scroll', 'repeat', 0, due, 1000)).toBeNull()
  })
})
