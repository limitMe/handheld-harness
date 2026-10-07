import { useEffect, useMemo, useRef, type ReactElement } from 'react'
import { CONTEXT_ORDER, onPress, useInputApi, useInputContext } from '../input'
import { showToast } from '../ui'
import { dictation } from './instance'
import { useDictationStore } from './store'

/** Pushed only while dictating so B cancels instead of deactivating the input. */
function DictationCancelContext(): null {
  useInputContext(
    'dictation',
    useMemo(() => ({ 'dictation.cancel': onPress(() => dictation.cancel()) }), []),
    CONTEXT_ORDER.modal,
  )
  return null
}

/**
 * Wires the speech session into the input system (spec 16): long-press Y starts
 * and stops dictation, B cancels it, and the raw Y press pre-warms the mic.
 */
export function DictationLayer(): ReactElement | null {
  const api = useInputApi()
  const status = useDictationStore((state) => state.status)
  const error = useDictationStore((state) => state.error)
  const shownError = useRef<string | null>(null)

  useEffect(() => dictation.connect(), [])

  // Failures (no provider, missing key, network) surface as a light hint (spec 16).
  useEffect(() => {
    if (!error || error === shownError.current) return
    shownError.current = error
    showToast(error)
  }, [error])

  useInputContext(
    'global',
    useMemo(
      () => ({
        'voice.dictate': (event) => {
          if (event.source === 'keyboard') {
            // Keyboard has no hold: Ctrl+D toggles dictation.
            if (event.phase !== 'start') return
            if (dictation.active) void dictation.stop()
            else void dictation.start()
            return
          }
          if (event.phase === 'start') void dictation.start()
          else if (event.phase === 'end') void dictation.stop()
        },
      }),
      [],
    ),
    CONTEXT_ORDER.global,
  )

  useEffect(
    () =>
      api.subscribeControls((change) => {
        if (change.source !== 'gamepad' || change.control !== 'Y') return
        if (change.pressed) dictation.warm()
        else dictation.releaseAudio()
      }),
    [api],
  )

  return status === 'idle' ? null : <DictationCancelContext />
}
