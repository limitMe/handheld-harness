// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { CodeBlock } from '../../src/renderer/src/workbench/CodeBlock'
import { MarkdownView } from '../../src/renderer/src/workbench/Markdown'

afterEach(cleanup)

const fence = '```'

describe('MarkdownView code highlighting', () => {
  it('highlights a fenced block that names its language', () => {
    const { container } = render(
      <MarkdownView text={`${fence}ts\nconst answer: number = 42\n${fence}`} />,
    )

    const code = container.querySelector('pre code')
    expect(code?.className).toContain('hljs')
    expect(code?.className).toContain('language-ts')
    expect(container.querySelector('.hljs-keyword')).not.toBeNull()
  })

  it('highlights a fenced block without a language by detecting it', () => {
    const { container } = render(
      <MarkdownView text={`${fence}\nfunction greet(name) { return name }\n${fence}`} />,
    )

    const code = container.querySelector('pre code')
    expect(code?.className).toContain('hljs')
    expect(container.querySelector('pre code span[class^="hljs-"]')).not.toBeNull()
  })

  it('leaves inline code unhighlighted', () => {
    const { container } = render(<MarkdownView text={'use `npm run check` now'} />)

    const code = container.querySelector('code')
    expect(code?.className ?? '').not.toContain('hljs')
  })
})

describe('CodeBlock', () => {
  it('highlights a shell command with a forced language', () => {
    const { container } = render(<CodeBlock code={'grep -rn "foo" src'} language="bash" inline />)

    const code = container.querySelector('code')
    expect(code?.className).toContain('hljs')
    expect(code?.className).toContain('language-bash')
    expect(container.querySelector('span[class^="hljs-"]')).not.toBeNull()
  })

  it('detects the language when none is given', () => {
    const { container } = render(<CodeBlock code={'const answer = 42'} />)

    expect(container.querySelector('code')?.className).toContain('hljs')
  })

  it('does not let tilde runs close the fence', () => {
    const { container } = render(<CodeBlock code={'a ~~~ b'} language="bash" />)

    expect(container.textContent).toContain('a ~~~ b')
  })
})
