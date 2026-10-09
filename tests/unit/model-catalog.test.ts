import { describe, expect, it } from 'vitest'
import {
  toModelCatalog,
  type ProviderListData,
} from '../../src/main/engine/opencode/model-catalog'

const data: ProviderListData = {
  all: [
    {
      id: 'opencode',
      name: 'OpenCode Zen',
      models: { 'big-model': { id: 'big-model', name: 'Big Model', limit: { context: 128_000 } } },
    },
    {
      id: 'anthropic',
      name: 'Anthropic',
      models: {
        'claude-x': {
          id: 'claude-x',
          name: 'Claude X',
          limit: { context: 200_000 },
          variants: { high: {}, max: {} },
        },
      },
    },
  ],
  connected: ['anthropic'],
}

describe('toModelCatalog', () => {
  it('keeps only connected providers', () => {
    const catalog = toModelCatalog(data)
    expect(catalog.groups.map((group) => group.providerId)).toEqual(['anthropic'])
    expect(catalog.setupCommand).toBeUndefined()
  })

  it('carries context limit and variants through', () => {
    const [group] = toModelCatalog(data).groups
    expect(group?.models[0]).toEqual({
      id: 'claude-x',
      name: 'Claude X',
      contextLimit: 200_000,
      variants: ['high', 'max'],
    })
  })

  it('offers the OpenCode login command when nothing is connected', () => {
    const catalog = toModelCatalog({ ...data, connected: [] })
    expect(catalog.groups).toEqual([])
    expect(catalog.setupCommand).toBe('opencode auth login')
  })

  it('treats a missing connected list as nothing connected', () => {
    const catalog = toModelCatalog({ all: data.all })
    expect(catalog.groups).toEqual([])
    expect(catalog.setupCommand).toBe('opencode auth login')
  })

  it('tolerates an empty response', () => {
    const catalog = toModelCatalog({})
    expect(catalog).toEqual({ groups: [], setupCommand: 'opencode auth login' })
  })
})
