import { memo } from 'react'
import Markdown, { type Components } from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import { cn } from '../ui'

/** Unwraps the block so only the highlighted inline `<code>` remains. */
const INLINE_COMPONENTS: Components = {
  pre: ({ children }) => <>{children}</>,
}

export interface CodeBlockProps {
  code: string
  /** Highlight language; when omitted the language is auto-detected. */
  language?: string
  /** Single-line variant for tool titles: no frame, no wrapping. */
  inline?: boolean
  /** Let long lines wrap instead of scrolling horizontally. */
  wrap?: boolean
  /** Drop the border/radius for output that already sits inside a framed card. */
  frameless?: boolean
  className?: string
}

/** A tilde fence longer than any run of tildes inside the code. */
function fenceFor(code: string): string {
  const longest = (code.match(/~{3,}/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0)
  return '~'.repeat(Math.max(3, longest + 1))
}

/**
 * Highlights a raw string as code through the same rehype-highlight pipeline and
 * `.hljs-*` palette as `MarkdownView` (spec 13). Tool calls and tool output are
 * plain text, not Markdown, so they render as a fenced block here.
 */
export const CodeBlock = memo(function CodeBlock({
  code,
  language,
  inline = false,
  wrap = false,
  frameless = false,
  className,
}: CodeBlockProps) {
  const fence = fenceFor(code)
  const source = `${fence}${language ?? ''}\n${code}\n${fence}`
  const root = cn(
    'code-block',
    inline && 'code-block--inline',
    wrap && 'code-block--wrap',
    frameless && 'code-block--frameless',
    className,
  )
  const body = (
    <Markdown
      rehypePlugins={[[rehypeHighlight, { detect: !language }]]}
      components={inline ? INLINE_COMPONENTS : undefined}
    >
      {source}
    </Markdown>
  )
  return inline ? <span className={root}>{body}</span> : <div className={root}>{body}</div>
})
