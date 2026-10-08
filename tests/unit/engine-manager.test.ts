import { describe, expect, it } from 'vitest'
import { EngineManager } from '../../src/main/engine/engines'
import type { AgentEngine, EngineCapabilities, EngineEvent } from '../../src/shared/engine'

const capabilities: EngineCapabilities = {
  streamingDeltas: false,
  permissionAlways: false,
  questions: false,
  commands: false,
  deleteSession: false,
  transcriptReplay: false,
  multiClient: false,
  forkSession: false,
  messageUsage: false,
  modelEffort: false,
  sessionDirectory: false,
}

function stubEngine(id: string, kind: AgentEngine['kind'] = 'fake') {
  const listeners = new Set<(event: EngineEvent) => void>()
  const engine: AgentEngine = {
    id,
    kind,
    capabilities: () => ({ ...capabilities }),
    snapshot: async () => ({
      engineId: id,
      kind,
      capabilities: { ...capabilities },
      status: { state: 'ready', mode: 'fake', version: '0', workspaceDir: '' },
      sessions: [],
      pendingPermissions: [],
      pendingQuestions: [],
    }),
    listSessions: async () => [],
    createSession: async () => ({
      id: 's',
      title: 't',
      createdAt: 0,
      updatedAt: 0,
      runState: 'idle',
    }),
    deleteSession: async () => undefined,
    getMessages: async () => [],
    setSessionModel: async () => undefined,
    setSessionEffort: async () => undefined,
    prompt: async () => undefined,
    abort: async () => undefined,
    replyPermission: async () => undefined,
    replyQuestion: async () => undefined,
    rejectQuestion: async () => undefined,
    listModels: async () => [],
    listCommands: async () => [],
    runCommand: async () => undefined,
    onEvent: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
  return { engine, emit: (event: EngineEvent) => listeners.forEach((listener) => listener(event)) }
}

describe('EngineManager', () => {
  it('routes by engineId and reports unknown engines clearly', () => {
    const manager = new EngineManager()
    const a = stubEngine('opencode', 'opencode')
    const b = stubEngine('fake')
    manager.register(a.engine, { default: true })
    manager.register(b.engine)

    expect(manager.get().id).toBe('opencode')
    expect(manager.get('fake').id).toBe('fake')
    expect(manager.getByRef({ engineId: 'fake', sessionId: 's' }).id).toBe('fake')
    expect(() => manager.get('missing')).toThrow(/Unknown engineId: missing/)
  })

  it('tags forwarded events with the engine id', () => {
    const manager = new EngineManager()
    const a = stubEngine('opencode', 'opencode')
    manager.register(a.engine, { default: true })
    const received: Array<{ engineId: string; event: EngineEvent }> = []
    manager.onEvent((payload) => received.push(payload))

    a.emit({ type: 'session.deleted', sessionId: 's' })

    expect(received).toEqual([
      { engineId: 'opencode', event: { type: 'session.deleted', sessionId: 's' } },
    ])
  })

  it('lists registered engines', () => {
    const manager = new EngineManager()
    manager.register(stubEngine('opencode', 'opencode').engine, { default: true })
    manager.register(stubEngine('fake').engine)
    expect(manager.list()).toEqual([
      { engineId: 'opencode', kind: 'opencode' },
      { engineId: 'fake', kind: 'fake' },
    ])
  })

  it('rejects restart for engines without the capability', async () => {
    const manager = new EngineManager()
    manager.register(stubEngine('fake').engine, { default: true })
    await expect(manager.restart()).rejects.toThrow(/does not support restart/)
  })

  it('throws when no engine is registered', () => {
    expect(() => new EngineManager().get()).toThrow(/No engine is registered/)
  })
})
