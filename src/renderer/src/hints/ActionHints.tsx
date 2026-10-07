import { actionLabel } from '@shared/actions'
import { useTranslation } from '../i18n'
import { cn } from '../ui'
import type { HintEntry } from './entries'

const CONTROL_LABELS: Record<string, string> = {
  A: 'A',
  B: 'B',
  X: 'X',
  Y: 'Y',
  LB: 'LB',
  RB: 'RB',
  LT: 'LT',
  RT: 'RT',
  Back: 'Back',
  Start: 'Start',
  LS: 'LS',
  RS: 'RS',
  DpadUp: '↑',
  DpadDown: '↓',
  DpadLeft: '←',
  DpadRight: '→',
}

export function controlLabel(control: string): string {
  return CONTROL_LABELS[control] ?? control
}

const RING_RADIUS = 14
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

function KeyCap({
  control,
  phase,
  progress,
}: {
  control: string
  phase: 'press' | 'hold'
  progress: number
}) {
  if (phase !== 'hold') {
    return (
      <span className="inline-flex h-8 min-w-8 items-center justify-center rounded border border-surface-raised bg-card px-1 text-sm font-semibold text-on-card">
        {controlLabel(control)}
      </span>
    )
  }
  return (
    <span
      data-testid="hold-ring"
      data-holding={progress > 0 ? 'true' : undefined}
      className="relative inline-flex h-8 min-w-8 items-center justify-center px-1 text-sm font-semibold text-on-card"
    >
      <svg viewBox="0 0 32 32" className="absolute inset-0 h-8 w-8 -rotate-90">
        <circle
          cx="16"
          cy="16"
          r={RING_RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-surface-raised"
        />
        <circle
          cx="16"
          cy="16"
          r={RING_RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)}
          className="text-accent"
        />
      </svg>
      {controlLabel(control)}
    </span>
  )
}

export interface ActionHintsProps {
  entries: HintEntry[]
  /** Control currently held down, with its fill ratio, while the hint is shown. */
  holding?: { control: string; progress: number } | null
  className?: string
}

/** Presentational hint strip; positioning and timing belong to `HintsProvider`. */
export function ActionHints({ entries, holding, className }: ActionHintsProps) {
  const { t } = useTranslation()
  if (entries.length === 0) return null
  return (
    <div
      data-testid="action-hints"
      className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 text-base', className)}
    >
      {entries.map((entry) => {
        const progress =
          entry.phase === 'hold' && holding && holding.control === entry.control
            ? holding.progress
            : 0
        return (
          <span
            key={entry.action}
            data-action={entry.action}
            data-phase={entry.phase}
            className="inline-flex items-center gap-2 text-on-card"
          >
            <KeyCap control={entry.control} phase={entry.phase} progress={progress} />
            <span>{t(`actions.${entry.action}`, { defaultValue: actionLabel(entry.action) })}</span>
            {entry.phase === 'hold' ? (
              <span className="text-sm uppercase tracking-wide text-text-muted">
                {t('part.hold')}
              </span>
            ) : null}
          </span>
        )
      })}
    </div>
  )
}
