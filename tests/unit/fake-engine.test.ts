import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { EngineEvent } from '../../src/shared/engine'
import { FakeEngine, parseFakeCapabilities } from '../../src/main/engine/fake'
import { runEngineContract } from '../engine-contract'

const fixturePath = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'opencode',
  '1.18.34',
  'basic-tool-permission.jsonl',
)

function makeEngine(capabilities?: string): FakeEngine {
  return new FakeEngine({
    fixturePath,
    capabilities,
    eventDelayMs: 0,
    deltaDelayMs: 0,
  })
}

function waitForEvent(
  engine: FakeEngine,
  predicate: (event: EngineEvent) => boolean,
  timeoutMs = 5000,
): Promise<EngineEvent> {
  return new Promise((resolve, reject) => {
    let off = (): void => undefined
    const timer = setTimeout(() => {
      off()
      reject(new Error('Timed out waiting for event'))
    }, timeoutMs)
    off = engine.onEvent((event) => {
      if (!predicate(event)) return
      clearTimeout(timer)
      off()
      resolve(event)
    })
  })
}

async function promptAndWait(engine: FakeEngine, sessionId: string, text: string): Promise<void> {
  const idle = waitForEvent(
    engine,
    (event) => event.type === 'session.runState' && event.sessionId === sessionId && event.runState === 'idle',
  )
  await engine.prompt(sessionId, { text })
  await idle
}

describe('FakeEngine', () => {
  it('passes the backend-agnostic engine contract by replaying the fixture', async () => {
    const engine = makeEngine()
    await engine.start()
    const result = await runEngineContract(engine, {
      promptText: 'anything goes here',
      expectText: 'DONE',
      timeoutMs: 30_000,
    })
    expect(result.sessionId).toBeTruthy()
  })

  it('parses capability overrides and ignores unknown keys', () => {
    const caps = parseFakeCapabilities('streamingDeltas=false,permissionAlways=0,bogus=true')
    expect(caps.streamingDeltas).toBe(false)
    expect(caps.permissionAlways).toBe(false)
    expect(caps.questions).toBe(true)
  })

  it('suppresses deltas when streamingDeltas is off but keeps the final text', async () => {
    const engine = makeEngine('streamingDeltas=false')
    await engine.start()
    const session = await engine.createSession()
    const deltas: EngineEvent[] = []
    engine.onEvent((event) => {
      if (event.type === 'part.delta') deltas.push(event)
    })
    await promptAndWait(engine, session.id, 'hello')
    const messages = await engine.getMessages(session.id)
    const text = messages
      .flatMap((message) => message.parts)
      .filter((part) => part.type === 'text')
      .map((part) => (part.type === 'text' ? part.text : ''))
      .join('')
    expect(text).toContain('DONE')
    expect(deltas).toHaveLength(0)
  })

  it('streams the long scenario', async () => {
    const engine = makeEngine()
    await engine.start()
    const session = await engine.createSession()
    await promptAndWait(engine, session.id, '/fake long')
    const messages = await engine.getMessages(session.id)
    const text = messages
      .flatMap((message) => message.parts)
      .filter((part) => part.type === 'text')
      .map((part) => (part.type === 'text' ? part.text : ''))
      .join('')
    expect(text.length).toBeGreaterThan(2000)
    expect(text).toContain('```')
  })

  it('asks for permission and clears it after a reply', async () => {
    const engine = makeEngine()
    await engine.start()
    const session = await engine.createSession()
    const asked = waitForEvent(engine, (event) => event.type === 'permission.asked')
    await engine.prompt(session.id, { text: '/fake permission' })
    const event = await asked
    if (event.type !== 'permission.asked') throw new Error('unexpected event')
    expect((await engine.snapshot()).pendingPermissions).toHaveLength(1)

    const replied = waitForEvent(engine, (candidate) => candidate.type === 'permission.replied')
    await engine.replyPermission(session.id, event.request.id, 'once')
    await replied
    expect((await engine.snapshot()).pendingPermissions).toHaveLength(0)
  })

  it('asks a question and clears it after an answer', async () => {
    const engine = makeEngine()
    await engine.start()
    const session = await engine.createSession()
    const asked = waitForEvent(engine, (event) => event.type === 'question.asked')
    await engine.prompt(session.id, { text: '/fake question' })
    const event = await asked
    if (event.type !== 'question.asked') throw new Error('unexpected event')
    expect((await engine.snapshot()).pendingQuestions).toHaveLength(1)

    const replied = waitForEvent(engine, (candidate) => candidate.type === 'question.replied')
    await engine.replyQuestion(session.id, event.request.id, [['Option A']])
    await replied
    expect((await engine.snapshot()).pendingQuestions).toHaveLength(0)
  })

  it('generates a large transcript in the many scenario', async () => {
    const engine = makeEngine()
    await engine.start()
    const session = await engine.createSession()
    await promptAndWait(engine, session.id, '/fake many')
    const messages = await engine.getMessages(session.id)
    expect(messages).toHaveLength(201)
  })

  it('reports an error in the error scenario', async () => {
    const engine = makeEngine()
    await engine.start()
    const session = await engine.createSession()
    const errored = waitForEvent(engine, (event) => event.type === 'session.error')
    await engine.prompt(session.id, { text: '/fake error' })
    await errored
    const snapshot = await engine.snapshot()
    expect(snapshot.sessions[0]?.runState).toBe('error')
  })
})
