import { useRef } from 'react'
import type { ChatMessage } from '@shared/engine'
import { cn } from '../ui'
import { MessageItem } from './MessageItem'

export interface StickyUserMessageProps {
  message: ChatMessage
  /** Sibling order band for this message's parts; see `FOCUS_ORDER`. */
  baseOrder: number
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
  baseOrder,
  collapsed,
  onRestore,
}: StickyUserMessageProps) {
  const ref = useRef<HTMLDivElement>(null)

  return (
    <div
      ref={ref}
      data-testid="sticky-user"
      data-collapsed={collapsed ? '' : undefined}
      className="sticky top-0 z-10 flex justify-end"
    >
      {collapsed ? (
        <button
          type="button"
          data-testid={`user-collapsed-${message.id}`}
          onClick={onRestore}
          className={cn(
            'max-w-[min(100%,46rem)] truncate rounded-card bg-card px-4 py-2 text-left text-on-card shadow-card',
            'opacity-90 transition-opacity duration-ui ease-standard hover:opacity-100',
          )}
        >
          {userMessageText(message) || '…'}
        </button>
      ) : (
        <MessageItem message={message} baseOrder={baseOrder} />
      )}
    </div>
  )
}
