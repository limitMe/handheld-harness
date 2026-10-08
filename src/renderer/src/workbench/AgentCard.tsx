import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useFocusable } from '../focus'
import { useTranslation } from '../i18n'
import { cn } from '../ui'
import { AgentCardFooter, MessageItem } from './MessageItem'
import type { AgentCard } from './rounds'

/** Keeps a snapped card clear of the sticky user header (spec 13). */
export const CARD_SCROLL_MARGIN_TOP = 40

export interface AgentCardProps {
  card: AgentCard
  order: number
  streaming: boolean
  /** One-screen cap; unset while the container height is still unknown. */
  maxHeight?: number
  onOpen: (card: AgentCard) => void
  /** Fired when the content size changes, so the transcript can re-anchor too. */
  onResize?: () => void
}

/**
 * Full-width agent reply card (spec 13). Holds mid-round thinking/actions or the
 * final summary, grows with its content up to one screen, and anchors new
 * content to the bottom: older lines past the top collapse into an ellipsis.
 * A opens it full screen from the top.
 */
export function AgentCardView({
  card,
  order,
  streaming,
  maxHeight,
  onOpen,
  onResize,
}: AgentCardProps) {
  const { t } = useTranslation()
  const ref = useRef<HTMLElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [overflowing, setOverflowing] = useState(false)

  const focus = useFocusable({
    id: `card-${card.id}`,
    elementRef: ref,
    order,
    onActivate: () => onOpen(card),
    onFocus: () => ref.current?.scrollIntoView({ block: 'start' }),
  })

  // Anchor the newest content to the bottom. Content (Markdown, highlighted
  // code) can render after the first layout, so observing the inner block keeps
  // the card bottom-aligned instead of leaving it stuck at the top.
  const anchor = useCallback(() => {
    const element = contentRef.current
    if (!element) return
    element.scrollTop = element.scrollHeight
    setOverflowing(element.scrollHeight - element.clientHeight > 1)
  }, [])

  useLayoutEffect(() => {
    anchor()
  }, [card.messages, maxHeight, anchor])

  const onResizeRef = useRef(onResize)
  useEffect(() => {
    onResizeRef.current = onResize
  })

  useEffect(() => {
    const inner = innerRef.current
    if (!inner) return
    const observer = new ResizeObserver(() => {
      anchor()
      onResizeRef.current?.()
    })
    observer.observe(inner)
    return () => observer.disconnect()
  }, [anchor])

  return (
    <article
      ref={ref}
      {...focus.props}
      data-testid="agent-card"
      data-kind={card.kind}
      data-overflowing={overflowing ? '' : undefined}
      style={{ maxHeight, scrollMarginTop: CARD_SCROLL_MARGIN_TOP }}
      className={cn(
        'flex w-full flex-col gap-2 rounded-card border border-surface-raised bg-surface-raised px-4 py-3 text-text',
        card.kind === 'intermediate' && 'agent-card--intermediate',
      )}
    >
      <header className="flex items-center gap-2 text-code uppercase tracking-wide text-text-muted">
        <span>{t(`agentCard.${card.kind}`)}</span>
      </header>

      <div className="relative min-h-0 flex-1">
        <div ref={contentRef} data-testid="agent-card-content" className="h-full overflow-hidden">
          <div ref={innerRef} className="flex flex-col gap-3">
            {card.messages.map((message) => (
              <MessageItem
                key={message.id}
                message={message}
                baseOrder={order}
                streaming={streaming}
                focusable={false}
                showFooter={false}
              />
            ))}
          </div>
        </div>
        {overflowing ? (
          <div
            data-testid="agent-card-ellipsis"
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-surface-raised from-40% to-transparent text-center text-text-muted"
          >
            …
          </div>
        ) : null}
      </div>

      <AgentCardFooter messages={card.messages} />
    </article>
  )
}
