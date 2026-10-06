import { useState } from 'react'
import type { ChatPart } from '@shared/engine'
import { MarkdownView } from './Markdown'

function ToolStateIcon({ state }: { state: Extract<ChatPart, { type: 'tool' }>['state'] }) {
  switch (state) {
    case 'pending':
      return <span className="text-text-muted">·</span>
    case 'running':
      return <span className="animate-pulse text-warning">●</span>
    case 'completed':
      return <span className="text-success">✓</span>
    case 'error':
      return <span className="text-danger">✗</span>
  }
}

function ToolPart({ part }: { part: Extract<ChatPart, { type: 'tool' }> }) {
  const [expanded, setExpanded] = useState(false)
  const label = part.title ?? part.inputSummary ?? part.tool
  const detail = part.error ?? part.output ?? part.inputSummary ?? 'No output'
  return (
    <div className="overflow-hidden rounded-md border border-surface-raised bg-card">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-code text-on-card transition-colors duration-fast ease-standard hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:outline-none"
      >
        <span className="text-text-muted">{expanded ? '▾' : '▸'}</span>
        <span className="font-mono">{part.tool}</span>
        <span className="flex-1 truncate text-text-muted">{label}</span>
        <ToolStateIcon state={part.state} />
      </button>
      {expanded ? (
        <pre className="max-h-[40vh] overflow-auto border-t border-surface-raised px-3 py-2 text-code whitespace-pre-wrap text-text-muted">
          {detail}
        </pre>
      ) : null}
    </div>
  )
}

function ReasoningPart({ text }: { text: string }) {
  return (
    <details className="rounded-md border border-surface-raised bg-card">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-3 py-2 text-code text-text-muted">
        Thinking
      </summary>
      <div className="max-h-[40vh] overflow-auto border-t border-surface-raised px-3 py-2 text-text-muted">
        <MarkdownView text={text} />
      </div>
    </details>
  )
}

export interface PartViewProps {
  part: ChatPart
  streaming?: boolean
}

export function PartView({ part, streaming = false }: PartViewProps) {
  switch (part.type) {
    case 'text':
      return <MarkdownView text={part.text} streaming={streaming} />
    case 'reasoning':
      return <ReasoningPart text={part.text} />
    case 'tool':
      return <ToolPart part={part} />
    case 'file':
      return (
        <span className="inline-block rounded-md bg-card px-2 py-1 text-code text-text-muted">
          {part.filename ?? part.mime}
        </span>
      )
    case 'other':
      return (
        <span className="inline-block rounded-md bg-card px-2 py-1 text-code text-text-muted">
          {part.rawType}
        </span>
      )
  }
}
