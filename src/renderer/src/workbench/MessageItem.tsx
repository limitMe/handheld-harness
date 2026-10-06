import type { ChatMessage } from '@shared/engine'
import { PartView } from './PartView'

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

export interface MessageItemProps {
  message: ChatMessage
  streaming?: boolean
}

export function MessageItem({ message, streaming = false }: MessageItemProps) {
  const isUser = message.role === 'user'
  const duration =
    message.completedAt !== undefined && message.completedAt >= message.createdAt
      ? message.completedAt - message.createdAt
      : undefined

  return (
    <article
      data-testid={`message-${message.role}`}
      className={`message-item flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`flex max-w-[min(100%,46rem)] flex-col gap-2 rounded-card px-4 py-3 ${
          isUser ? 'bg-card text-on-card' : 'bg-surface-raised text-text'
        }`}
      >
        {message.parts.length === 0 && isUser ? (
          <p className="whitespace-pre-wrap break-words">{message.error ?? ''}</p>
        ) : null}
        {message.parts.map((part) => (
          <PartView key={part.id} part={part} streaming={streaming} />
        ))}
        {!isUser ? (
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
