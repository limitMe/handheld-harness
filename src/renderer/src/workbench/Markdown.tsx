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

export function MarkdownView({ text, streaming = false }: MarkdownViewProps) {
  const throttled = useThrottledValue(text, 50)
  return (
    <div className="markdown">
      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={components}>
        {streaming ? throttled : text}
      </Markdown>
    </div>
  )
}
