import { memo } from 'react'
import Markdown, { type Components } from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { useThrottledValue } from '../hooks/useThrottledValue'

const components: Components = {
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-accent underline decoration-accent/60 underline-offset-2 hover:decoration-accent"
      onClick={(event) => {
        event.preventDefault()
        if (href) void window.handheld.app.openExternal(href)
      }}
    >
      {children}
    </a>
  ),
}

export interface MarkdownViewProps {
  text: string
  streaming?: boolean
}

/**
 * Memoized so scrolling (which re-renders the transcript and its cards) does not
 * re-run react-markdown, which re-parses and re-highlights on every render.
 */
export const MarkdownView = memo(function MarkdownView({
  text,
  streaming = false,
}: MarkdownViewProps) {
  const throttled = useThrottledValue(text, 50)
  return (
    <div className="markdown">
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true }]]}
        components={components}
      >
        {streaming ? throttled : text}
      </Markdown>
    </div>
  )
})
