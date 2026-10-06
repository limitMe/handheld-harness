import { useEffect, useRef } from 'react'
import { Button } from '../ui'

export interface ComposerProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onAbort: () => void
  busy: boolean
  /** Changes whenever the input should regain focus (new task or session switch). */
  focusKey: string
}

export function Composer({ value, onChange, onSend, onAbort, busy, focusKey }: ComposerProps) {
  const textarea = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const element = textarea.current
    if (!element) return
    element.style.height = 'auto'
    const maxHeight = Math.round(window.innerHeight * 0.4)
    element.style.height = `${Math.min(element.scrollHeight, maxHeight)}px`
  }, [value])

  useEffect(() => {
    textarea.current?.focus()
  }, [focusKey])

  const canSend = value.trim().length > 0

  return (
    <form
      className="flex shrink-0 items-end gap-3 border-t border-surface-raised bg-surface px-4 py-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (!busy) onSend()
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
          if (event.key === 'Escape' && busy) {
            event.preventDefault()
            onAbort()
            return
          }
          if (event.key !== 'Enter' || event.shiftKey) return
          // Never send while an IME is composing (spec 03 section 4).
          if (event.nativeEvent.isComposing) return
          event.preventDefault()
          if (!busy) onSend()
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
    </form>
  )
}
