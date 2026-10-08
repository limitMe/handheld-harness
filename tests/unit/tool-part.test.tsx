// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { ChatPart } from '../../src/shared/engine'
import { FocusContainer, FocusProvider } from '../../src/renderer/src/focus'
import { CONTEXT_ORDER, InputProvider, useInputContext } from '../../src/renderer/src/input'
import { PartView } from '../../src/renderer/src/workbench/PartView'

afterEach(cleanup)

beforeEach(() => {
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [] })
})

function Harness({ children }: { children: ReactNode }) {
  useInputContext('currentWork', {}, CONTEXT_ORDER.screen)
  return (
    <FocusContainer id="tool-part-root" flow="column">
      {children}
    </FocusContainer>
  )
}

type ToolPart = Extract<ChatPart, { type: 'tool' }>

const bashTool: ToolPart = {
  id: 't1',
  type: 'tool',
  tool: 'bash',
  title: 'grep -rn "foo" src',
  state: 'completed',
  inputSummary: '{"command":"grep -rn \\"foo\\" src"}',
  output: 'src/a.ts:1:foo',
}

function renderTool(part: ToolPart) {
  return render(
    <InputProvider>
      <FocusProvider>
        <Harness>
          <PartView part={part} order={0} focusable={false} />
        </Harness>
      </FocusProvider>
    </InputProvider>,
  )
}

describe('ToolPart highlighting', () => {
  it('highlights a shell command inline', () => {
    const { container } = renderTool(bashTool)

    const code = container.querySelector('.code-block--inline code')
    expect(code?.className).toContain('hljs')
    expect(code?.className).toContain('language-bash')
  })

  it('highlights the expanded output', () => {
    const { container } = renderTool(bashTool)

    fireEvent.click(screen.getByRole('button'))

    expect(container.querySelector('.code-block--frameless code')?.className).toContain('hljs')
  })

  it('leaves non-shell titles unhighlighted', () => {
    const { container } = renderTool({ ...bashTool, tool: 'read', title: 'src/a.ts' })

    expect(container.querySelector('.code-block--inline')).toBeNull()
  })
})
