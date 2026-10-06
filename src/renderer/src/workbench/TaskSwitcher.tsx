import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react'
import type { SessionRef, SessionSummary } from '@shared/engine'
import { FocusContainer, useFocusable } from '../focus'
import { CONTEXT_ORDER, onPress, useInputContext } from '../input'
import { Overlay, cn } from '../ui'
import { formatRelativeTime } from './time'

export interface TaskSwitcherEntry {
  ref: SessionRef
  summary: SessionSummary
  hasPending: boolean
}

export interface TaskSwitcherProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entries: TaskSwitcherEntry[]
  onSelect: (ref: SessionRef) => void
}

function TaskRow({
  entry,
  active,
  focusId,
  order,
  onChoose,
}: {
  entry: TaskSwitcherEntry
  active: boolean
  focusId: string
  order: number
  onChoose: () => void
}) {
  const rowRef = useRef<HTMLButtonElement>(null)
  const focus = useFocusable({ id: focusId, elementRef: rowRef, order, onActivate: onChoose })
  return (
    <button
      ref={rowRef}
      {...focus.props}
      type="button"
      onClick={onChoose}
      data-active={active}
      className={cn(
        'flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-on-card transition-colors duration-fast ease-standard',
        active ? 'bg-card' : 'hover:bg-card',
      )}
    >
      {entry.summary.runState === 'busy' ? (
        <span className="animate-pulse text-warning">●</span>
      ) : (
        <span className="text-text-muted">·</span>
      )}
      <span className="flex-1 truncate">{entry.summary.title}</span>
      {entry.hasPending ? <span className="text-warning">⚠</span> : null}
      <span className="text-code text-text-muted">
        {formatRelativeTime(entry.summary.updatedAt)}
      </span>
    </button>
  )
}

/**
 * Child component so its effect runs before the parent `FocusContainer` pushes
 * the scope; otherwise the scope's first focus would land on a row.
 */
function TaskFilter({
  inputRef,
  value,
  onChange,
  onKeyDown,
  onActivate,
}: {
  inputRef: RefObject<HTMLInputElement | null>
  value: string
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  onActivate: () => void
}) {
  const focus = useFocusable({
    id: 'task-filter',
    elementRef: inputRef,
    order: 0,
    activatable: true,
    onActivate,
  })
  return (
    <input
      ref={inputRef}
      {...focus.props}
      data-testid="task-filter"
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      placeholder="Filter tasks…"
      className="min-h-11 rounded-md border border-surface-raised bg-card px-3 py-2 text-base text-on-card placeholder:text-text-muted focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:outline-none"
    />
  )
}

/** Mounted only while open, so filter and selection reset on every open. */
function TaskSwitcherBody({
  onOpenChange,
  entries,
  onSelect,
}: Omit<TaskSwitcherProps, 'open'>) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  useInputContext(
    'taskSwitcher',
    useMemo(() => ({ 'map.exit': onPress(() => onOpenChange(false)) }), [onOpenChange]),
    CONTEXT_ORDER.modal,
  )

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => input.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return entries
    return entries.filter((entry) => entry.summary.title.toLowerCase().includes(needle))
  }, [entries, query])

  const active = Math.min(selected, Math.max(0, filtered.length - 1))

  const choose = (index: number): void => {
    const entry = filtered[index]
    if (!entry) return
    onSelect(entry.ref)
    onOpenChange(false)
  }

  return (
    <Overlay
      open
      onOpenChange={onOpenChange}
      title="Tasks"
      description="Ctrl+K toggles. Type to filter, ↑/↓ to move, Enter to switch."
    >
      <FocusContainer id="task-switcher" flow="column" memory scope>
        <TaskFilter
          inputRef={input}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setSelected(0)
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setSelected((value) => Math.min(value + 1, filtered.length - 1))
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setSelected((value) => Math.max(value - 1, 0))
            } else if (event.key === 'Enter') {
              event.preventDefault()
              choose(active)
            } else if (event.key === 'Escape') {
              event.preventDefault()
              onOpenChange(false)
            }
          }}
          onActivate={() => input.current?.focus()}
        />
        <ul
          data-testid="task-list"
          data-scroll-region
          className="flex max-h-[50vh] flex-col gap-1 overflow-y-auto"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-text-muted">No tasks.</li>
          ) : (
            filtered.map((entry, index) => (
              <li key={`${entry.ref.engineId}:${entry.ref.sessionId}`}>
                <TaskRow
                  entry={entry}
                  active={index === active}
                  focusId={`task-row-${entry.ref.engineId}-${entry.ref.sessionId}`}
                  order={index + 1}
                  onChoose={() => choose(index)}
                />
              </li>
            ))
          )}
        </ul>
      </FocusContainer>
    </Overlay>
  )
}

export function TaskSwitcher({ open, ...rest }: TaskSwitcherProps) {
  if (!open) return null
  return <TaskSwitcherBody {...rest} />
}
