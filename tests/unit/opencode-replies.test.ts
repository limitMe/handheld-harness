import { describe, expect, it } from 'vitest'
import { OpenCodeEngine } from '../../src/main/engine/opencode/adapter'
import { silentLogger } from '../../src/main/engine/logger'

type Call = Record<string, unknown>

/**
 * A session may live outside the engine's workspace (spec 21). The server
 * resolves permission and question requests per directory, so every reply must
 * carry the session's directory or it is rejected as unknown.
 */
function engineWith(calls: Call[]): OpenCodeEngine {
  const engine = new OpenCodeEngine({
    mode: 'attached',
    workspaceDir: 'C:/workspace',
    serversDir: 'C:/servers',
    logsDir: 'C:/logs',
    sdkVersion: '1.18.34',
    baseDir: 'C:/app',
    logger: silentLogger,
  })
  const internals = engine as unknown as {
    client: unknown
    directories: Record<string, string>
  }
  internals.client = {
    permission: {
      reply: async (input: Call) => {
        calls.push({ kind: 'permission.reply', ...input })
        return { data: true }
      },
    },
    question: {
      reply: async (input: Call) => {
        calls.push({ kind: 'question.reply', ...input })
        return { data: true }
      },
      reject: async (input: Call) => {
        calls.push({ kind: 'question.reject', ...input })
        return { data: true }
      },
    },
  }
  internals.directories = { s1: 'C:/other-project' }
  return engine
}

describe('OpenCodeEngine replies', () => {
  it('sends the session directory with a permission reply', async () => {
    const calls: Call[] = []
    await engineWith(calls).replyPermission('s1', 'per_1', 'always')
    expect(calls).toEqual([
      { kind: 'permission.reply', requestID: 'per_1', reply: 'always', directory: 'C:/other-project' },
    ])
  })

  it('sends the session directory with question replies and rejects', async () => {
    const calls: Call[] = []
    const engine = engineWith(calls)
    await engine.replyQuestion('s1', 'que_1', [['yes']])
    await engine.rejectQuestion('s1', 'que_2')
    expect(calls).toEqual([
      {
        kind: 'question.reply',
        requestID: 'que_1',
        answers: [['yes']],
        directory: 'C:/other-project',
      },
      { kind: 'question.reject', requestID: 'que_2', directory: 'C:/other-project' },
    ])
  })
})
