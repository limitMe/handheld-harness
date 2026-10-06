import { describe, expect, it } from 'vitest'
import { resolveSessionModel } from '../../src/main/engine/opencode/model-resolution'
import type { ModelRef } from '../../src/shared/engine'

const table: ModelRef = { providerId: 'table', modelId: 'table-model' }
const assistant: ModelRef = { providerId: 'assistant', modelId: 'assistant-model' }
const server: ModelRef = { providerId: 'server', modelId: 'server-model' }
const fallback: ModelRef = { providerId: 'default', modelId: 'default-model' }

describe('resolveSessionModel', () => {
  it('prefers the adapter table', () => {
    expect(
      resolveSessionModel({
        fromTable: table,
        lastAssistant: assistant,
        serverModel: server,
        defaultModel: fallback,
      }),
    ).toBe(table)
  })

  it('falls back to the last assistant model', () => {
    expect(
      resolveSessionModel({
        lastAssistant: assistant,
        serverModel: server,
        defaultModel: fallback,
      }),
    ).toBe(assistant)
  })

  it('falls back to the server-reported session model', () => {
    expect(resolveSessionModel({ serverModel: server, defaultModel: fallback })).toBe(server)
  })

  it('falls back to the engine default', () => {
    expect(resolveSessionModel({ defaultModel: fallback })).toBe(fallback)
  })

  it('returns undefined when nothing is known', () => {
    expect(resolveSessionModel({})).toBeUndefined()
  })
})
