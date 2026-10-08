import { useRef } from 'react'
import type { ChatMessage } from '@shared/engine'
import { useFocusable } from '../focus'
import { cn } from '../ui'
import { CARD_SCROLL_MARGIN_TOP } from './AgentCard'
import { PartView } from './PartView'

export interface StickyUserMessageProps {
  message: ChatMessage
  /** Sibling order band for this card; see `FOCUS_ORDER`. */
  order: number
  /** True while the round is scrolled past its original position and pinned. */
  collapsed: boolean
  onRestore: () => void
}

/** Plain text for the collapsed one-line summary (spec 13). */
export function userMessageText(message: ChatMessage): string {
  return message.parts
    .flatMap((part) => (part.type === 'text' ? [part.text] : []))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * A user message wrapped in a sticky container so it stays pinned at the top
 * while its reply is read, shrinking to a single truncated line (spec 13).
 * P-18: the truncation is CSS-driven, so it always fills the screen width.
 */
export function StickyUserMessage({
  message,
  order,
  collapsed,
  onRestore,
}: StickyUserMessageProps) {
  const elementRef = useRef<HTMLElement | null>(null)
  const focus = useFocusable({
    id: `card-user-${message.id}`,
    elementRef,
    order,
    onFocus: () => elementRef.current?.scrollIntoView({ block: 'start' }),
  })

  // Focusing a collapsed message expands it: the user must see what they
  // landed on, even while the round is still pinned under the top edge.
  const showCollapsed = collapsed && !focus.focused

  return (
    <div
      data-testid="sticky-user"
      data-collapsed={showCollapsed ? '' : undefined}
      className="sticky top-0 z-10 flex justify-end"
    >
      {showCollapsed ? (
        <button
          ref={(element) => {
            elementRef.current = element
          }}
          {...focus.props}
          data-testid={`user-collapsed-${message.id}`}
          onClick={onRestore}
          className={cn(
            'h-10 max-w-[min(100%,46rem)] truncate rounded-card bg-card px-4 text-left text-on-card shadow-card',
            'opacity-90 transition-opacity duration-ui ease-standard hover:opacity-100',
          )}
        >
          {userMessageText(message) || '…'}
        </button>
      ) : (
        <div
          ref={(element) => {
            elementRef.current = element
          }}
          {...focus.props}
          data-testid="user-card"
          style={{ scrollMarginTop: CARD_SCROLL_MARGIN_TOP }}
          className="flex max-w-[min(100%,46rem)] flex-col gap-2 rounded-card bg-card px-4 py-3 text-on-card"
        >
          {message.parts.length === 0 ? (
            <p className="whitespace-pre-wrap break-words">{message.error ?? ''}</p>
          ) : null}
          {message.parts.map((part, index) => (
            <PartView key={part.id} part={part} order={order + index} focusable={false} />
          ))}
        </div>
      )}
    </div>
  )
}
