import { useRef } from 'react'
import { FocusContainer, useFocusable } from '../focus'
import { CONTEXT_ORDER, useInputContext } from '../input'
import { useTranslation } from '../i18n'
import { AgentCardFooter, MessageItem } from './MessageItem'
import type { AgentCard } from './rounds'

const SCROLL_STEP = 72

export interface CardViewerProps {
  card: AgentCard
  onClose: () => void
}

/**
 * Full-screen reader for one agent card (spec 13). It covers the current-work
 * area below the status bar, starts at the top, and scrolls with the D-pad or
 * either stick. B (or Esc) returns; the caller restores the transcript scroll.
 */
export function CardViewer({ card, onClose }: CardViewerProps) {
  return (
    <FocusContainer id="card-viewer-scope" scope detached>
      <CardViewerBody card={card} onClose={onClose} />
    </FocusContainer>
  )
}

/** Rendered inside the scope so the scroller registers as its focus child. */
function CardViewerBody({ card, onClose }: CardViewerProps) {
  const { t } = useTranslation()
  const scroller = useRef<HTMLDivElement>(null)

  const scrollBy = (delta: number): void => {
    const element = scroller.current
    if (element) element.scrollTop += delta
  }

  const focus = useFocusable({
    id: 'card-viewer',
    elementRef: scroller,
    onCancel: () => onClose(),
  })

  useInputContext(
    'cardView',
    {
      'nav.up': (event) => {
        if (event.phase !== 'end') scrollBy(-SCROLL_STEP)
      },
      'nav.down': (event) => {
        if (event.phase !== 'end') scrollBy(SCROLL_STEP)
      },
      'nav.deactivate': () => onClose(),
    },
    CONTEXT_ORDER.overlay,
  )

  return (
    <div
      data-testid="card-viewer-overlay"
      className="absolute inset-0 z-40 flex flex-col bg-surface-raised text-text"
    >
      <header className="flex items-center px-4 py-2 text-code uppercase tracking-wide text-text-muted">
        <span>{t(`agentCard.${card.kind}`)}</span>
      </header>
      <div
        ref={scroller}
        {...focus.props}
        data-testid="card-viewer"
        data-scroll-region
        className="scrollbar-hidden flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-6"
      >
        {card.messages.map((message) => (
          <MessageItem
            key={message.id}
            message={message}
            baseOrder={0}
            focusable={false}
            showFooter={false}
          />
        ))}
        <AgentCardFooter messages={card.messages} />
      </div>
    </div>
  )
}
