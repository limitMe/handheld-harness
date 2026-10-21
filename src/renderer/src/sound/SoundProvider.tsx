import { useEffect, useRef, type ReactNode } from 'react'
import type { Settings } from '@shared/ipc'
import { DEFAULT_SOUND } from '@shared/sound'
import { useInputApi } from '../input'
import { useWorkbenchStore } from '../state/store'
import { resolveCue } from './cues'
import { soundPlayer } from './player'

/**
 * Plays a short sound for controller-button presses when enabled, plus a
 * completion cue when the agent stops running (spec 15). It listens to the
 * routed action stream, so every screen gets feedback without per-screen
 * wiring; unhandled actions stay silent.
 */
export function SoundProvider({ children }: { children: ReactNode }) {
  const api = useInputApi()
  const enabled = useRef(DEFAULT_SOUND.enabled)
  const completionEnabled = useRef(DEFAULT_SOUND.completionEnabled)
  const lastScrollAt = useRef(0)

  // The setting can change at runtime; hot-reload it like the hint settings.
  useEffect(() => {
    const bridge = window.handheld
    if (!bridge) return
    let disposed = false
    const apply = (next: Settings): void => {
      enabled.current = next.sound.enabled
      completionEnabled.current = next.sound.completionEnabled
      soundPlayer.enabled = next.sound.enabled
      soundPlayer.completionEnabled = next.sound.completionEnabled
      if (next.sound.enabled || next.sound.completionEnabled) soundPlayer.preload()
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

  useEffect(() => {
    return useWorkbenchStore.subscribe((state, previous) => {
      if (!completionEnabled.current) return
      const finished = Object.entries(state.sessions).some(
        ([key, session]) =>
          session.runState === 'idle' && previous.sessions[key]?.runState === 'busy',
      )
      if (finished) soundPlayer.playCompletion()
    })
  }, [])

  return <>{children}</>
}
