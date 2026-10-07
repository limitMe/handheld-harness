import { useEffect, useRef, useState, type RefObject } from 'react'
import type { SessionRef } from '@shared/engine'
import { CONTEXT_ORDER, onPress, useInputContext } from '../input'
import { useTranslation } from '../i18n'
import { AnchoredPanel, cn } from '../ui'
import type { HistoryEntry } from './taskCards'
import { formatRelativeTime } from './time'

export interface HistoryListProps {
  /** The empty card the panel floats next to. */
  anchor: RefObject<Element | null>
  entries: HistoryEntry[]
  onChoose: (ref: SessionRef) => void
  onCancel: () => void
}

/**
 * History picker opened from the task map's empty card (spec 14). Same shape as
 * the list input (12): an anchored list driven by up/down, A to confirm, B to
 * cancel. It pushes its own context so the map's bindings are shadowed while open.
 */
export function HistoryList({ anchor, entries, onChoose, onCancel }: HistoryListProps) {
  const { t } = useTranslation()
  const [highlighted, setHighlighted] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const choose = (index: number): void => {
    const entry = entries[index]
    if (!entry) return
    onChoose(entry.ref)
  }

  useInputContext(
    'taskMap.history',
    {
      'nav.up': onPress(() => setHighlighted((index) => Math.max(index - 1, 0))),
      'nav.down': onPress(() => setHighlighted((index) => index + 1)),
      'nav.activate': onPress(() => choose(highlighted)),
      'nav.deactivate': onPress(() => onCancel()),
    },
    CONTEXT_ORDER.modal,
  )

  const active = Math.min(highlighted, Math.max(0, entries.length - 1))

  // Take DOM focus so the list's context owns the keyboard arrows.
  useEffect(() => {
    containerRef.current?.focus()
  }, [])

  return (
    <AnchoredPanel open anchor={anchor} side="top" align="center" className="w-80 p-1">
      <div
        ref={containerRef}
        tabIndex={-1}
        data-testid="task-history"
        data-scroll-region
        className="flex max-h-[50vh] flex-col gap-1 overflow-y-auto outline-none"
      >
        <p className="px-3 py-1 text-sm uppercase tracking-wide text-text-muted">
          {t('taskMap.historyTitle')}
        </p>
        {entries.length === 0 ? (
          <p className="px-3 py-2 text-text-muted">{t('taskMap.noClosedTasks')}</p>
        ) : (
          entries.map((entry, index) => (
            <button
              key={entry.summary.id}
              type="button"
              data-testid={`task-history-${entry.summary.id}`}
              data-highlighted={index === active ? '' : undefined}
              onMouseEnter={() => setHighlighted(index)}
              onClick={() => choose(index)}
              className={cn(
                // `bg-surface` reads against the raised panel in both themes.
                'flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-left transition-colors duration-fast ease-standard',
                index === active ? 'bg-surface text-text' : 'text-text-muted hover:bg-surface',
              )}
            >
              <span className="flex-1 truncate">{entry.summary.title}</span>
              <span className="text-code text-text-muted">
                {formatRelativeTime(entry.summary.updatedAt, t)}
              </span>
            </button>
          ))
        )}
      </div>
    </AnchoredPanel>
  )
}
