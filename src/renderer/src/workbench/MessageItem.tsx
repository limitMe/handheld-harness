import type { ChatMessage } from '@shared/engine'
import { PartView } from './PartView'

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

export interface MessageItemProps {
  message: ChatMessage
  streaming?: boolean
  /** Sibling order band for this message's parts; see `FOCUS_ORDER`. */
  baseOrder: number
  /** False inside grouped cards, where the card itself is the focus stop. */
  focusable?: boolean
  /** Hide the per-message footer; grouped cards render one footer for the card. */
  showFooter?: boolean
}

export function MessageItem({
  message,
  streaming = false,
  baseOrder,
  focusable = true,
  showFooter = true,
}: MessageItemProps) {
  const isUser = message.role === 'user'
  const duration =
    message.completedAt !== undefined && message.completedAt >= message.createdAt
      ? message.completedAt - message.createdAt
      : undefined

  return (
    <article data-testid={`message-${message.role}`} className="message-item flex w-full">
      <div className="flex w-full flex-col gap-2">
        {message.parts.length === 0 && isUser ? (
          <p className="whitespace-pre-wrap break-words">{message.error ?? ''}</p>
        ) : null}
        {message.parts.map((part, index) => (
          <PartView
            key={part.id}
            part={part}
            order={baseOrder + index}
            streaming={streaming}
            focusable={focusable}
          />
        ))}
        {!isUser && showFooter ? (
          <footer className="flex flex-wrap items-center gap-3 text-code text-text-muted">
            {message.model ? (
              <span>
                {message.model.providerId}/{message.model.modelId}
              </span>
            ) : null}
            {duration !== undefined ? <span>{formatDuration(duration)}</span> : null}
            {message.error ? <span className="text-danger">{message.error}</span> : null}
          </footer>
        ) : null}
      </div>
    </article>
  )
}

/** Footer for a grouped agent card: model and total duration of its messages. */
export function AgentCardFooter({ messages }: { messages: ChatMessage[] }) {
  const last = messages[messages.length - 1]
  const first = messages[0]
  if (!last || !first) return null
  const duration =
    last.completedAt !== undefined && last.completedAt >= first.createdAt
      ? last.completedAt - first.createdAt
      : undefined
  const error = messages.find((message) => message.error)?.error
  return (
    <footer className="flex flex-wrap items-center gap-3 text-code text-text-muted">
      {last.model ? (
        <span>
          {last.model.providerId}/{last.model.modelId}
        </span>
      ) : null}
      {duration !== undefined ? <span>{formatDuration(duration)}</span> : null}
      {error ? <span className="text-danger">{error}</span> : null}
    </footer>
  )
}
