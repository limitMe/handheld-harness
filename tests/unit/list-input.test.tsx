// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { InputProvider } from '../../src/renderer/src/input'
import { ListInput } from '../../src/renderer/src/workbench/ListInput'

afterEach(() => {
  cleanup()
  delete (window as unknown as { handheld?: unknown }).handheld
})

describe('ListInput', () => {
  it('truncates a long command description instead of overflowing', async () => {
    const description = 'a very long command description '.repeat(40)
    ;(window as unknown as { handheld: unknown }).handheld = {
      settings: {
        get: async () => ({ input: { contexts: {}, keyboard: {} } }),
        update: async () => undefined,
      },
      events: { on: () => () => undefined },
      engine: {
        listCommands: async () => [{ name: 'compact', description }],
      },
    }
    const anchor = document.createElement('div')
    document.body.append(anchor)

    render(
      <InputProvider>
        <ListInput anchor={anchor} onChoose={() => undefined} onCancel={() => undefined} />
      </InputProvider>,
    )

    const option = await screen.findByTestId('list-input-compact')
    const label = Array.from(option.querySelectorAll('span')).find((span) =>
      span.className.includes('text-code'),
    )
    expect(label?.className).toContain('truncate')
  })
})
