import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { CommandInfo } from '@shared/engine'
import { CONTEXT_ORDER, onPress, useInputContext } from '../input'
import { AnchoredPanel, cn } from '../ui'
import { orderCommands } from './commands'
import { useListInputStore } from './listInputStore'

const EMPTY_RECENT: string[] = []

export interface ListInputProps {
  anchor: Element | RefObject<Element | null> | null
  engineId?: string
  onChoose: (command: CommandInfo) => void
  onCancel: () => void
}

/**
 * Command picker shown next to the composer while it is activated (spec 12).
 * Entries come from the engine's `listCommands()` and are ordered by use.
 */
export function ListInput({ anchor, engineId, onChoose, onCancel }: ListInputProps) {
  const [commands, setCommands] = useState<CommandInfo[]>([])
  const [highlighted, setHighlighted] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const recent = useListInputStore((state) =>
    engineId ? (state.recent[engineId] ?? EMPTY_RECENT) : EMPTY_RECENT,
  )

  useEffect(() => {
    const bridge = window.handheld?.engine
    if (!bridge) return
    let cancelled = false
    bridge
      .listCommands(engineId)
      .then((list) => {
        if (!cancelled) setCommands(list)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [engineId])

  const ordered = useMemo(() => orderCommands(commands, recent), [commands, recent])
  const active = Math.min(highlighted, Math.max(0, ordered.length - 1))

  const choose = useCallback(
    (index: number) => {
      const command = ordered[index]
      if (!command) return
      if (engineId) useListInputStore.getState().record(engineId, command.name)
      onChoose(command)
    },
    [ordered, engineId, onChoose],
  )

  useInputContext(
    'currentWork.listInput',
    {
      'nav.up': onPress(() => setHighlighted((index) => Math.max(index - 1, 0))),
      'nav.down': onPress(() => setHighlighted((index) => index + 1)),
      'nav.activate': onPress(() => choose(active)),
      'nav.deactivate': onPress(() => onCancel()),
    },
    CONTEXT_ORDER.overlay,
  )

  // Take DOM focus so keyboard navigation uses the list context, not the textarea.
  useEffect(() => {
    containerRef.current?.focus()
  }, [])

  return (
    <AnchoredPanel open anchor={anchor} side="top" align="start" className="w-72 p-1">
      <div
        ref={containerRef}
        tabIndex={-1}
        data-testid="list-input"
        data-scroll-region
        className="flex max-h-[50vh] flex-col gap-1 overflow-y-auto outline-none"
      >
        {ordered.length === 0 ? (
          <p className="px-3 py-2 text-text-muted">No commands.</p>
        ) : (
          ordered.map((command, index) => (
            <button
              key={command.name}
              type="button"
              data-testid={`list-input-${command.name}`}
              data-highlighted={index === active ? '' : undefined}
              onMouseEnter={() => setHighlighted(index)}
              onClick={() => choose(index)}
              className={cn(
                'flex min-h-11 flex-col items-start rounded-md px-3 py-2 text-left transition-colors duration-fast ease-standard',
                index === active ? 'bg-card text-on-card' : 'text-text-muted hover:bg-card',
              )}
            >
              <span className="w-full truncate font-mono">/{command.name}</span>
              {command.description ? (
                <span className="w-full truncate text-code text-text-muted">
                  {command.description}
                </span>
              ) : null}
            </button>
          ))
        )}
      </div>
    </AnchoredPanel>
  )
}
