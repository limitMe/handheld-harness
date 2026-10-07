import { describe, expect, it } from 'vitest'
import type { ModelGroup } from '../../src/shared/engine'
import { filterModelGroups } from '../../src/shared/model-search'

const groups: ModelGroup[] = [
  {
    providerId: 'openai',
    name: 'OpenAI',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'o3', name: 'o3' },
    ],
  },
  {
    providerId: 'anthropic',
    name: 'Anthropic',
    models: [{ id: 'sonnet', name: 'Claude Sonnet' }],
  },
]

describe('filterModelGroups', () => {
  it('returns the catalog unchanged for a blank query', () => {
    expect(filterModelGroups(groups, '  ')).toBe(groups)
  })

  it('keeps a provider and all its models when the provider name matches', () => {
    const result = filterModelGroups(groups, 'open')
    expect(result.map((group) => group.providerId)).toEqual(['openai'])
    expect(result[0]?.models.map((model) => model.id)).toEqual(['gpt-4o', 'o3'])
  })

  it('keeps only matching models, case-insensitively', () => {
    const result = filterModelGroups(groups, 'O3')
    expect(result.map((group) => group.providerId)).toEqual(['openai'])
    expect(result[0]?.models.map((model) => model.id)).toEqual(['o3'])
  })

  it('matches the model id when the name does not', () => {
    const result = filterModelGroups(groups, 'sonnet')
    expect(result.map((group) => group.providerId)).toEqual(['anthropic'])
    expect(result[0]?.models.map((model) => model.id)).toEqual(['sonnet'])
  })

  it('returns nothing when no provider or model matches', () => {
    expect(filterModelGroups(groups, 'zzz')).toEqual([])
  })
})
