import { useEffect, useRef, useState } from 'react'

/**
 * Returns `value`, updated at most once per `intervalMs`. Used to throttle
 * Markdown re-rendering while a text part streams in (spec 03 section 3).
 */
export function useThrottledValue<T>(value: T, intervalMs: number): T {
  const [throttled, setThrottled] = useState(value)
  const latest = useRef(value)
  const emitted = useRef(value)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    latest.current = value
    if (timer.current !== null) return
    timer.current = window.setTimeout(() => {
      timer.current = null
      if (!Object.is(latest.current, emitted.current)) {
        emitted.current = latest.current
        setThrottled(latest.current)
      }
    }, intervalMs)
  }, [value, intervalMs])

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    },
    [],
  )

  return throttled
}
