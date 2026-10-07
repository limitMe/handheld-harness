import { actionLabel } from '@shared/actions'
import { GamepadGlyph, hasFaceGlyph } from '../glyphs'
import { useTranslation } from '../i18n'
import { cn } from '../ui'
import type { HintEntry } from './entries'

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
            <GamepadGlyph control={entry.control} phase={entry.phase} progress={progress} />
            <span>{t(`actions.${entry.action}`, { defaultValue: actionLabel(entry.action) })}</span>
            {entry.phase === 'hold' && hasFaceGlyph(entry.control) ? (
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
