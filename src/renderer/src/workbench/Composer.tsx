import { useCallback, useEffect, useRef, useState } from 'react'
import type { CommandInfo } from '@shared/engine'
import {
  FOCUS_ORDER,
  useFocusTree,
  useFocusable,
  type FocusDirection,
  type NavigateResult,
} from '../focus'
import { CONTEXT_ORDER, onPress, useInputContext } from '../input'
import { Button } from '../ui'
import { ListInput } from './ListInput'
import { isOnFirstLine, moveCaretHorizontal, moveCaretVertical } from './textEditing'

export interface ComposerProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onAbort: () => void
  busy: boolean
  /** Changes whenever the input should regain focus (new task or session switch). */
  focusKey: string
  /** Engine that owns the command list; defaults to the engine list's default. */
  engineId?: string
  /** List input is unavailable when the engine has no `commands` capability. */
  commandsAvailable?: boolean
}

const COMPOSER_ID = 'composer'

/** Pushed only while activated so `A` sends instead of navigating (spec 10 stack). */
function ComposerInputContext({
  onSend,
  onDeactivate,
  onListInput,
}: {
  onSend: () => void
  onDeactivate: () => void
  onListInput?: () => void
}) {
  useInputContext(
    'currentWork.input',
    {
      'input.send': onPress(() => onSend()),
      'input.deactivate': onPress(() => onDeactivate()),
      ...(onListInput ? { 'input.listInput': onPress(() => onListInput()) } : {}),
    },
    CONTEXT_ORDER.activated,
  )
  return null
}

function setCaret(element: HTMLTextAreaElement, position: number): void {
  element.setSelectionRange(position, position)
}

export function Composer({
  value,
  onChange,
  onSend,
  onAbort,
  busy,
  focusKey,
  engineId,
  commandsAvailable = false,
}: ComposerProps) {
  const tree = useFocusTree()
  const textarea = useRef<HTMLTextAreaElement>(null)
  const formRef = useRef<HTMLFormElement | null>(null)
  const [listOpen, setListOpen] = useState(false)

  const activate = useCallback(() => {
    textarea.current?.focus()
  }, [])

  const deactivate = useCallback(() => {
    setListOpen(false)
    textarea.current?.blur()
    formRef.current?.focus()
  }, [])

  const handleNavigate = useCallback((direction: FocusDirection): NavigateResult => {
    const element = textarea.current
    if (!element) return 'pass'
    const text = element.value
    const position = element.selectionStart
    if (direction === 'up') {
      // Two-stage exit: leave activation, the next up moves focus normally.
      if (isOnFirstLine(text, position)) return 'exit'
      setCaret(element, moveCaretVertical(text, position, -1))
      return 'handled'
    }
    if (direction === 'down') {
      setCaret(element, moveCaretVertical(text, position, 1))
      return 'handled'
    }
    if (direction === 'left') {
      setCaret(element, moveCaretHorizontal(position, -1, text.length))
      return 'handled'
    }
    setCaret(element, moveCaretHorizontal(position, 1, text.length))
    return 'handled'
  }, [])

  const focus = useFocusable({
    id: COMPOSER_ID,
    elementRef: formRef,
    order: FOCUS_ORDER.composer,
    activatable: true,
    onActivate: activate,
    onDeactivate: deactivate,
    onNavigate: handleNavigate,
  })

  useEffect(() => {
    const element = textarea.current
    if (!element) return
    element.style.height = 'auto'
    const maxHeight = Math.round(window.innerHeight * 0.4)
    element.style.height = `${Math.min(element.scrollHeight, maxHeight)}px`
  }, [value])

  // Start focused and activated so typing and Win+H keep working (spec 13 owns the collapsed bar).
  useEffect(() => {
    if (tree) {
      tree.setFocus(COMPOSER_ID)
      tree.activate(COMPOSER_ID)
    } else {
      textarea.current?.focus()
    }
  }, [tree, focusKey])

  const canSend = value.trim().length > 0
  const send = useCallback(() => {
    if (!busy && !listOpen) onSend()
  }, [busy, listOpen, onSend])

  const insertCommand = useCallback(
    (command: CommandInfo) => {
      onChange(`/${command.name}`)
      setListOpen(false)
      window.requestAnimationFrame(() => textarea.current?.focus())
    },
    [onChange],
  )

  const closeListInput = useCallback(() => {
    setListOpen(false)
    window.requestAnimationFrame(() => textarea.current?.focus())
  }, [])

  return (
    <form
      ref={formRef}
      {...focus.props}
      className="flex shrink-0 items-end gap-3 border-t border-surface-raised bg-surface px-4 py-3"
      onSubmit={(event) => {
        event.preventDefault()
        send()
      }}
    >
      <textarea
        ref={textarea}
        data-testid="composer"
        rows={1}
        value={value}
        placeholder="Message the agent…"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            if (busy) {
              onAbort()
            } else {
              tree?.deactivate()
            }
            return
          }
          if (event.key !== 'Enter' || event.shiftKey) return
          // Never send while an IME is composing (spec 03 section 4).
          if (event.nativeEvent.isComposing) return
          event.preventDefault()
          send()
        }}
        className="max-h-[40vh] min-h-11 flex-1 resize-none overflow-auto rounded-card border border-surface-raised bg-card px-4 py-2.5 text-base text-on-card placeholder:text-text-muted focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:outline-none"
      />
      {busy ? (
        <Button type="button" data-testid="stop-button" className="min-h-11" onClick={onAbort}>
          Stop
        </Button>
      ) : (
        <Button type="submit" data-testid="send-button" className="min-h-11" disabled={!canSend}>
          Send
        </Button>
      )}
      {focus.activated ? (
        <ComposerInputContext
          onSend={send}
          onDeactivate={() => tree?.deactivate()}
          {...(commandsAvailable ? { onListInput: () => setListOpen(true) } : {})}
        />
      ) : null}
      {focus.activated && listOpen ? (
        <ListInput
          anchor={formRef}
          engineId={engineId}
          onChoose={insertCommand}
          onCancel={closeListInput}
        />
      ) : null}
    </form>
  )
}
