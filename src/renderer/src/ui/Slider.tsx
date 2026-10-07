import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { cn } from './cn'

export interface SliderProps {
  /** Fraction in the 0..1 range; the caller maps the domain onto it. */
  value: number
  /** Called with a 0..1 fraction while the track is dragged (pointer / touch). */
  onChange?: (fraction: number) => void
  className?: string
}

const trackStyles = 'relative block h-2 w-full rounded-full bg-card'

const fillStyles = 'absolute inset-y-0 left-0 rounded-full bg-accent'

const thumbStyles =
  'pointer-events-none absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-accent'

/** Presentational / draggable slider track (spec 15). Left/right adjustment lives in the page. */
export function Slider({ value, onChange, className }: SliderProps) {
  const track = useRef<HTMLSpanElement>(null)
  const dragging = useRef(false)
  const clamped = Math.min(1, Math.max(0, value))

  const emit = (clientX: number): void => {
    const element = track.current
    if (!element || !onChange) return
    const rect = element.getBoundingClientRect()
    if (rect.width === 0) return
    onChange(Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)))
  }

  const interaction = onChange
    ? {
        onPointerDown: (event: ReactPointerEvent<HTMLSpanElement>): void => {
          dragging.current = true
          event.currentTarget.setPointerCapture?.(event.pointerId)
          emit(event.clientX)
        },
        onPointerMove: (event: ReactPointerEvent<HTMLSpanElement>): void => {
          if (dragging.current) emit(event.clientX)
        },
        onPointerUp: (event: ReactPointerEvent<HTMLSpanElement>): void => {
          dragging.current = false
          event.currentTarget.releasePointerCapture?.(event.pointerId)
        },
      }
    : {}

  return (
    <span
      ref={track}
      role="slider"
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={Math.round(clamped * 100)}
      data-testid="slider"
      className={cn(trackStyles, onChange ? 'cursor-pointer touch-none' : '', className)}
      {...interaction}
    >
      <span className={fillStyles} style={{ width: `${clamped * 100}%` }} />
      <span className={thumbStyles} style={{ left: `${clamped * 100}%` }} />
    </span>
  )
}
