import { useEffect, useState } from 'react'
import type { EngineStatus } from '@shared/engine'

/** Tracks the default engine's status from the initial snapshot and live events. */
export function useEngineStatus(): EngineStatus | undefined {
  const [status, setStatus] = useState<EngineStatus | undefined>()

  useEffect(() => {
    const bridge = window.handheld?.engine
    if (!bridge) return
    let cancelled = false
    bridge
      .snapshot()
      .then((snapshot) => {
        if (!cancelled) setStatus(snapshot.status)
      })
      .catch(() => undefined)
    const off = bridge.onEvent(({ event }) => {
      if (event.type === 'engine.status') setStatus(event.status)
    })
    return () => {
      cancelled = true
      off()
    }
  }, [])

  return status
}
