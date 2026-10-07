import { cn } from './cn'

export interface SliderProps {
  /** Fraction in the 0..1 range; the caller maps the domain onto it. */
  value: number
  className?: string
}

const trackStyles = 'relative h-2 w-full overflow-hidden rounded-full bg-card'

const fillStyles = 'absolute inset-y-0 left-0 rounded-full bg-accent'

const thumbStyles =
  'absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-accent'

/** Presentational slider track (spec 15). Left/right adjustment lives in the page. */
export function Slider({ value, className }: SliderProps) {
  const clamped = Math.min(1, Math.max(0, value))
  return (
    <span className={cn(trackStyles, className)}>
      <span className={fillStyles} style={{ width: `${clamped * 100}%` }} />
      <span className={thumbStyles} style={{ left: `${clamped * 100}%` }} />
    </span>
  )
}
