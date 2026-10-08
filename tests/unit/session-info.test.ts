import { describe, expect, it } from 'vitest'
import type { ChatMessage, ModelGroup, SessionSummary } from '../../src/shared/engine'
import { buildSessionInfo } from '../../src/renderer/src/workbench/sessionInfo'

const CATALOG: ModelGroup[] = [
  {
    providerId: 'deepseek',
    name: 'DeepSeek',
    models: [
      {
        id: 'deepseek-v4-pro',
        name: 'DeepSeek V4 Pro',
        contextLimit: 128_000,
        variants: ['default', 'high', 'max'],
      },
    ],
  },
]

function assistant(id: string, createdAt: number, total: number, cost: number): ChatMessage {
  return {
    id,
    sessionId: 's1',
    role: 'assistant',
    createdAt,
    usage: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, total, cost },
    parts: [],
  }
}

const SUMMARY: SessionSummary = {
  id: 's1',
  title: 'Task',
  createdAt: 100,
  updatedAt: 200,
  runState: 'idle',
  model: { providerId: 'deepseek', modelId: 'deepseek-v4-pro' },
  effort: 'high',
  directory: 'C:/work',
}

describe('buildSessionInfo', () => {
  it('aggregates message count, latest context size and summed cost', () => {
    const info = buildSessionInfo({
      summary: SUMMARY,
      messages: [
        assistant('m1', 10, 1000, 0.001),
        { id: 'u1', sessionId: 's1', role: 'user', createdAt: 20, parts: [] },
        assistant('m2', 30, 5000, 0.002),
      ],
      catalog: CATALOG,
    })
    expect(info.messageCount).toBe(3)
    expect(info.contextUsed).toBe(5000)
    expect(info.contextPercent).toBeCloseTo(5000 / 128_000)
    expect(info.cost).toBeCloseTo(0.003)
    expect(info.modelName).toBe('DeepSeek V4 Pro')
    expect(info.providerId).toBe('deepseek')
    expect(info.effort).toBe('high')
    expect(info.effortOptions).toEqual(['default', 'high', 'max'])
    expect(info.directory).toBe('C:/work')
    expect(info.createdAt).toBe(100)
    expect(info.updatedAt).toBe(200)
  })

  it('falls back to the new-task inputs when there is no session', () => {
    const info = buildSessionInfo({
      model: { providerId: 'deepseek', modelId: 'deepseek-v4-pro' },
      effort: 'max',
      directory: 'C:/scratch',
      messages: [],
      catalog: CATALOG,
    })
    expect(info.messageCount).toBe(0)
    expect(info.contextUsed).toBe(0)
    expect(info.contextPercent).toBe(0)
    expect(info.contextLimit).toBe(128_000)
    expect(info.effort).toBe('max')
    expect(info.directory).toBe('C:/scratch')
    expect(info.createdAt).toBeUndefined()
  })

  it('leaves percent and limit undefined without catalog metadata', () => {
    const info = buildSessionInfo({
      summary: SUMMARY,
      messages: [assistant('m1', 10, 1000, 0)],
      catalog: [],
    })
    expect(info.contextLimit).toBeUndefined()
    expect(info.contextPercent).toBeUndefined()
    expect(info.modelName).toBeUndefined()
  })
})
