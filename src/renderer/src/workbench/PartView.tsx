import { useRef, useState, type ReactNode } from 'react'
import type { ChatPart } from '@shared/engine'
import { useFocusable } from '../focus'
import { useTranslation } from '../i18n'
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

const SCROLL_STEP = 48

type TextPartType = Extract<ChatPart, { type: 'text' }>
type ToolPartType = Extract<ChatPart, { type: 'tool' }>
type ReasoningPartType = Extract<ChatPart, { type: 'reasoning' }>

/** Each visible part is a focus stop, so the transcript can be scrolled/selected with the D-pad. */
function TextPart({
  part,
  streaming,
  order,
  focusable,
}: {
  part: TextPartType
  streaming: boolean
  order: number
  focusable: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const focus = useFocusable({ id: `part-${part.id}`, elementRef: ref, order, enabled: focusable })
  return (
    <div ref={ref} {...focus.props}>
      <MarkdownView text={part.text} streaming={streaming} />
    </div>
  )
}

function ToolPart({
  part,
  order,
  focusable,
}: {
  part: ToolPartType
  order: number
  focusable: boolean
}) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const output = useRef<HTMLPreElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const label = part.title ?? part.inputSummary ?? part.tool
  const detail = part.error ?? part.output ?? part.inputSummary ?? t('part.noOutput')
  const focus = useFocusable({
    id: `tool-${part.id}`,
    elementRef: buttonRef,
    order,
    enabled: focusable,
    activatable: true,
    onActivate: () => setExpanded(true),
    onNavigate: (direction) => {
      const element = output.current
      if (!element) return 'pass'
      if (direction === 'up') element.scrollTop -= SCROLL_STEP
      else if (direction === 'down') element.scrollTop += SCROLL_STEP
      else if (direction === 'left') element.scrollLeft -= SCROLL_STEP
      else element.scrollLeft += SCROLL_STEP
      return 'handled'
    },
  })
  return (
    <div className="overflow-hidden rounded-md border border-surface-raised bg-card">
      <button
        ref={buttonRef}
        {...focus.props}
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-code text-on-card transition-colors duration-fast ease-standard hover:bg-surface-raised"
      >
        <span className="text-text-muted">{expanded ? '▾' : '▸'}</span>
        <span className="font-mono">{part.tool}</span>
        <span className="flex-1 truncate text-text-muted">{label}</span>
        <ToolStateIcon state={part.state} />
      </button>
      {expanded ? (
        <pre
          ref={output}
          className="max-h-[40vh] overflow-auto border-t border-surface-raised px-3 py-2 text-code whitespace-pre-wrap text-text-muted"
        >
          {detail}
        </pre>
      ) : null}
    </div>
  )
}

function ReasoningPart({
  part,
  order,
  focusable,
}: {
  part: ReasoningPartType
  order: number
  focusable: boolean
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDetailsElement>(null)
  const focus = useFocusable({
    id: `part-${part.id}`,
    elementRef: ref,
    order,
    enabled: focusable,
    onActivate: () => {
      if (ref.current) ref.current.open = !ref.current.open
    },
  })
  return (
    <details ref={ref} {...focus.props} className="rounded-md border border-surface-raised bg-card">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-3 py-2 text-code text-text-muted">
        {t('part.thinking')}
      </summary>
      <div className="max-h-[40vh] overflow-auto border-t border-surface-raised px-3 py-2 text-text-muted">
        <MarkdownView text={part.text} />
      </div>
    </details>
  )
}

function TagPart({
  part,
  order,
  focusable,
  children,
}: {
  part: ChatPart
  order: number
  focusable: boolean
  children: ReactNode
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const focus = useFocusable({ id: `part-${part.id}`, elementRef: ref, order, enabled: focusable })
  return (
    <span
      ref={ref}
      {...focus.props}
      className="inline-block rounded-md bg-card px-2 py-1 text-code text-text-muted"
    >
      {children}
    </span>
  )
}

export interface PartViewProps {
  part: ChatPart
  order: number
  streaming?: boolean
  /** False inside grouped cards, where the card itself is the focus stop. */
  focusable?: boolean
}

export function PartView({
  part,
  order,
  streaming = false,
  focusable = true,
}: PartViewProps) {
  switch (part.type) {
    case 'text':
      return <TextPart part={part} order={order} streaming={streaming} focusable={focusable} />
    case 'reasoning':
      return <ReasoningPart part={part} order={order} focusable={focusable} />
    case 'tool':
      return <ToolPart part={part} order={order} focusable={focusable} />
    case 'file':
      return (
        <TagPart part={part} order={order} focusable={focusable}>
          {part.filename ?? part.mime}
        </TagPart>
      )
    case 'other':
      return (
        <TagPart part={part} order={order} focusable={focusable}>
          {part.rawType}
        </TagPart>
      )
  }
}
