import { cn } from './cn'

export interface SwitchProps {
  checked: boolean
  className?: string
}

const trackStyles =
  'inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-surface-raised transition-colors duration-fast ease-standard'

const thumbStyles =
  'h-5 w-5 rounded-full bg-on-card transition-transform duration-fast ease-standard'

/** Presentational on/off control (spec 15). The focus tree owns activation. */
export function Switch({ checked, className }: SwitchProps) {
  return (
    <span
      role="switch"
      aria-checked={checked}
      className={cn(trackStyles, checked ? 'bg-accent' : 'bg-card', className)}
    >
      <span className={cn(thumbStyles, checked ? 'translate-x-5' : 'translate-x-0.5')} />
    </span>
  )
}
