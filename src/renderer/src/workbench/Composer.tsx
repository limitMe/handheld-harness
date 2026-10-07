import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CommandInfo } from '@shared/engine'
import { dictation, type DictationTarget } from '../dictation'
import {
  FOCUS_ORDER,
  useFocusTree,
  useFocusable,
  type FocusDirection,
  type NavigateResult,
} from '../focus'
import { CONTEXT_ORDER, onPress, useInputContext } from '../input'
import { Button, cn } from '../ui'
import { ListInput } from './ListInput'
import {
  deleteBackward,
  isOnFirstLine,
  moveCaretHorizontal,
  moveCaretVertical,
} from './textEditing'

export interface ComposerProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onAbort: () => void
  busy: boolean
  /** Changes whenever the input should regain focus (new task or session switch). */
  focusKey: string
  /** When false (task map open) the composer does not steal focus behind the map. */
  autoActivate?: boolean
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
  onDeleteBackward,
  onListInput,
}: {
  onSend: () => void
  onDeactivate: () => void
  onDeleteBackward: () => void
  onListInput?: () => void
}) {
  useInputContext(
    'currentWork.input',
    {
      'input.send': onPress(() => onSend()),
      'input.deactivate': onPress(() => onDeactivate()),
      'input.deleteBackward': onPress(() => onDeleteBackward()),
      ...(onListInput ? { 'input.listInput': onPress(() => onListInput()) } : {}),
    },
    CONTEXT_ORDER.activated,
  )
  return null
}

function setCaret(element: HTMLTextAreaElement, position: number): void {
  element.setSelectionRange(position, position)
}

/**
 * Bottom composer (spec 13). It floats above the transcript so expanding or
 * collapsing never reflows the chat: collapsed it is a small centered bar,
 * expanded (focused, activated, or holding a draft) it is the floating input.
 */
export function Composer({
  value,
  onChange,
  onSend,
  onAbort,
  busy,
  focusKey,
  autoActivate = true,
  engineId,
  commandsAvailable = false,
}: ComposerProps) {
  const tree = useFocusTree()
  const textarea = useRef<HTMLTextAreaElement>(null)
  const formRef = useRef<HTMLFormElement | null>(null)
  const [listOpen, setListOpen] = useState(false)
  const valueRef = useRef(value)
  useEffect(() => {
    valueRef.current = value
  })

  const activate = useCallback(() => {
    textarea.current?.focus()
  }, [])

  const deactivate = useCallback(() => {
    setListOpen(false)
    textarea.current?.blur()
    formRef.current?.focus()
  }, [])

  // X deletes one character behind the caret (spec 10). Mirror the value into
  // the DOM so the caret lands immediately, then let the controlled update run.
  const deleteBackwardAtCaret = useCallback(() => {
    const element = textarea.current
    if (!element) return
    const next = deleteBackward(element.value, element.selectionStart, element.selectionEnd)
    element.value = next.value
    setCaret(element, next.position)
    onChange(next.value)
  }, [onChange])

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

  // Spec 16: dictation writes through this adapter while the field is focused.
  const dictationTarget = useMemo<DictationTarget>(
    () => ({
      getValue: () => valueRef.current,
      getSelection: () => {
        const element = textarea.current
        const length = valueRef.current.length
        return element
          ? { start: element.selectionStart, end: element.selectionEnd }
          : { start: length, end: length }
      },
      apply: (result) => {
        valueRef.current = result.value
        onChange(result.value)
        const element = textarea.current
        if (element) {
          element.value = result.value
          element.setSelectionRange(result.selectionStart, result.selectionEnd)
        }
      },
      activate: () => tree?.activate(COMPOSER_ID),
      isActivated: () => focus.activated,
      isAlive: () => textarea.current !== null,
    }),
    [onChange, tree, focus.activated],
  )

  useEffect(() => {
    if (!focus.focused && !focus.activated) {
      dictation.registerTarget(null)
      return undefined
    }
    dictation.registerTarget(dictationTarget)
    return () => dictation.registerTarget(null)
  }, [focus.focused, focus.activated, dictationTarget])

  const expanded = !tree || focus.focused || focus.activated || value.trim().length > 0
  const dimmed = Boolean(tree) && !focus.focused && !focus.activated && value.trim().length > 0

  useEffect(() => {
    const element = textarea.current
    if (!element) return
    element.style.height = 'auto'
    const maxHeight = Math.round(window.innerHeight * 0.4)
    element.style.height = `${Math.min(element.scrollHeight, maxHeight)}px`
  }, [value, expanded])

  // Activation is what puts the caret in the textarea; the field only mounts
  // once the composer expands.
  useEffect(() => {
    if (focus.activated) textarea.current?.focus()
  }, [focus.activated])

  // Start focused and activated so typing and Win+H keep working (spec 11).
  // While the task map is open the composer stays out of the way; the ref keeps
  // that check current without re-running this effect when the map closes, so
  // focus can return to whatever opened the map.
  const autoActivateRef = useRef(autoActivate)
  useEffect(() => {
    autoActivateRef.current = autoActivate
  })
  useEffect(() => {
    if (!autoActivateRef.current) return
    if (tree) {
      tree.setFocus(COMPOSER_ID)
      tree.activate(COMPOSER_ID)
    } else {
      textarea.current?.focus()
    }
  }, [tree, focusKey])

  const canSend = value.trim().length > 0
  const send = useCallback(() => {
    if (busy || listOpen) return
    // Settle dictation into the draft just before it is read, and detach so a
    // late final result cannot repopulate the field after it is cleared (spec 16).
    if (dictation.active) dictation.finish()
    onSend()
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
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-3">
      <form
        ref={formRef}
        {...focus.props}
        data-testid="composer-form"
        data-expanded={expanded ? '' : undefined}
        onClick={() => {
          if (!focus.activated) tree?.activate(COMPOSER_ID)
        }}
        onSubmit={(event) => {
          event.preventDefault()
          send()
        }}
        className={cn(
          'pointer-events-auto flex w-full max-w-3xl items-end gap-3 transition-[background-color,border-color,box-shadow,opacity] duration-ui ease-standard',
          expanded
            ? 'rounded-card border border-surface-raised bg-surface px-4 py-3 shadow-card'
            : 'min-h-11 justify-center border border-transparent',
          dimmed ? 'opacity-70' : '',
        )}
      >
        {expanded ? (
          <>
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
                  if (dictation.active) {
                    dictation.cancel()
                  } else if (busy) {
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
              className="scrollbar-hidden max-h-[40vh] min-h-11 flex-1 resize-none overflow-auto rounded-card border border-surface-raised bg-card px-4 py-2.5 text-base text-on-card placeholder:text-text-muted focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:outline-none"
            />
            {busy ? (
              <Button
                type="button"
                data-testid="stop-button"
                className="min-h-11"
                onClick={onAbort}
              >
                Stop
              </Button>
            ) : (
              <Button
                type="submit"
                data-testid="send-button"
                className="min-h-11"
                disabled={!canSend}
              >
                Send
              </Button>
            )}
          </>
        ) : (
          <span
            data-testid="composer-collapsed"
            aria-hidden="true"
            className={cn('h-1.5 w-24 rounded-full bg-text-muted/50', busy && 'animate-pulse')}
          />
        )}
        {focus.activated ? (
          <ComposerInputContext
            onSend={send}
            onDeactivate={() => tree?.deactivate()}
            onDeleteBackward={deleteBackwardAtCaret}
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
    </div>
  )
}
