import { useEffect, useRef, type ReactNode } from 'react'
import type { Settings } from '@shared/ipc'
import { DEFAULT_SOUND } from '@shared/sound'
import { useInputApi } from '../input'
import { resolveCue } from './cues'
import { soundPlayer } from './player'

/**
 * Plays a short sound for controller-button presses when enabled (spec 15). It
 * listens to the routed action stream, so every screen gets feedback without
 * per-screen wiring; unhandled actions stay silent.
 */
export function SoundProvider({ children }: { children: ReactNode }) {
  const api = useInputApi()
  const enabled = useRef(DEFAULT_SOUND.enabled)
  const lastScrollAt = useRef(0)

  // The setting can change at runtime; hot-reload it like the hint settings.
  useEffect(() => {
    const bridge = window.handheld
    if (!bridge) return
    let disposed = false
    const apply = (next: Settings): void => {
      enabled.current = next.sound.enabled
      soundPlayer.enabled = next.sound.enabled
      if (next.sound.enabled) soundPlayer.preload()
    }
    bridge.settings
      .get()
      .then((next) => {
        if (!disposed) apply(next)
      })
      .catch(() => undefined)
    const off = bridge.events.on('settings:changed', apply)
    return () => {
      disposed = true
      off()
    }
  }, [])

  useEffect(() => {
    return api.subscribeDispatch((record) => {
      if (!enabled.current || !record.handled) return
      const { action, phase, value } = record.event
      const decision = resolveCue(action, phase, value, performance.now(), lastScrollAt.current)
      if (!decision) return
      if (decision.scrollAt !== undefined) lastScrollAt.current = decision.scrollAt
      soundPlayer.play(decision.play)
    })
  }, [api])

  return <>{children}</>
}
