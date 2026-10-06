import assert from 'node:assert/strict'
import type { AgentEngine, ChatMessage, EngineEvent, ModelRef } from '../../src/shared/engine'

/**
 * Backend-agnostic contract for `AgentEngine`. Any engine implementation must
 * pass this. Cases are skipped based on `capabilities()` so a weaker backend
 * (e.g. the future ACP engine) can still be verified.
 */

export interface ContractOptions {
  promptText?: string
  expectText?: string
  timeoutMs?: number
  /** When omitted, the first model reported by `listModels()` is used. */
  model?: ModelRef
  onStep?: (name: string, durationMs: number, detail?: string) => void
}

export interface ContractResult {
  sessionId: string
  models: number
}

const DEFAULT_PROMPT = 'Reply with exactly: PONG'
const DEFAULT_EXPECT = 'PONG'

class StepReporter {
  constructor(readonly onStep: ContractOptions['onStep']) {}

  async run<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const started = Date.now()
    const value = await fn()
    this.onStep?.(name, Date.now() - started)
    return value
  }
}

function waitForRunState(
  engine: AgentEngine,
  sessionId: string,
  predicate: (event: Extract<EngineEvent, { type: 'session.runState' }>) => boolean,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      off()
      reject(new Error(`Timed out after ${timeoutMs}ms waiting for session ${sessionId} run state`))
    }, timeoutMs)
    const off = engine.onEvent((event) => {
      if (event.type === 'session.runState' && event.sessionId === sessionId && predicate(event)) {
        clearTimeout(timer)
        off()
        resolve()
      }
    })
  })
}

async function waitForIdle(
  engine: AgentEngine,
  sessionId: string,
  timeoutMs: number,
  events: EngineEvent[],
): Promise<void> {
  if (
    events.some(
      (e) => e.type === 'session.runState' && e.sessionId === sessionId && e.runState === 'idle',
    )
  )
    return
  await waitForRunState(engine, sessionId, (event) => event.runState === 'idle', timeoutMs)
}

function assistantText(messages: ChatMessage[]): string {
  return messages
    .filter((message) => message.role === 'assistant')
    .flatMap((message) => message.parts)
    .filter((part) => part.type === 'text')
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('\n')
}

function pickModel(models: Awaited<ReturnType<AgentEngine['listModels']>>): ModelRef | undefined {
  for (const provider of models) {
    const model = provider.models[0]
    if (model) return { providerId: provider.providerId, modelId: model.id }
  }
  return undefined
}

export async function runEngineContract(
  engine: AgentEngine,
  options: ContractOptions = {},
): Promise<ContractResult> {
  const reporter = new StepReporter(options.onStep)
  const timeoutMs = options.timeoutMs ?? 120_000
  const promptText = options.promptText ?? DEFAULT_PROMPT
  const expectText = options.expectText ?? DEFAULT_EXPECT
  const capabilities = engine.capabilities()

  const models = await reporter.run('listModels', () => engine.listModels())
  assert.ok(Array.isArray(models), 'listModels() must return an array')

  const session = await reporter.run('createSession', () =>
    engine.createSession({ title: 'contract' }),
  )
  assert.ok(session.id, 'createSession() must return an id')
  assert.equal(typeof session.title, 'string')
  assert.equal(session.runState, 'idle')

  const events: EngineEvent[] = []
  const off = engine.onEvent((event) => events.push(event))
  try {
    await reporter.run('prompt', () => engine.prompt(session.id, { text: promptText }))
    await reporter.run('waitForIdle', () => waitForIdle(engine, session.id, timeoutMs, events))

    const messages = await reporter.run('getMessages', () => engine.getMessages(session.id))
    const text = assistantText(messages)
    assert.ok(
      text.includes(expectText),
      `expected assistant text to contain ${JSON.stringify(expectText)}, got ${JSON.stringify(text.slice(0, 200))}`,
    )

    if (capabilities.transcriptReplay) {
      assert.ok(messages.length >= 2, 'expected at least a user and an assistant message')
    }

    reporter.onStep?.('eventOrder', 0)
    assertEventOrder(events, session.id)

    const model = options.model ?? pickModel(models)
    if (model) {
      await reporter.run('setSessionModel', () => engine.setSessionModel(session.id, model))
      const sessions = await engine.listSessions()
      const updated = sessions.find((candidate) => candidate.id === session.id)
      assert.ok(updated, 'session should still be listed')
      assert.deepEqual(updated?.model, model, 'SessionSummary.model should reflect setSessionModel')
    }

    if (capabilities.commands) {
      const commands = await reporter.run('listCommands', () => engine.listCommands())
      assert.ok(Array.isArray(commands), 'listCommands() must return an array')
      const command = commands.find((candidate) => candidate.name === 'compact') ?? commands[0]
      if (command) {
        await reporter.run('runCommand', () => engine.runCommand(session.id, command.name))
      }
    }

    // Abort is a no-op when the session is already idle, but it must still resolve.
    const abortSession = await reporter.run('abort:create', () =>
      engine.createSession({ title: 'contract-abort' }),
    )
    await reporter.run('abort', () => engine.abort(abortSession.id))
    await reporter.run('abort:delete', async () => {
      if (capabilities.deleteSession) await engine.deleteSession(abortSession.id)
    })

    if (capabilities.deleteSession) {
      await reporter.run('deleteSession', () => engine.deleteSession(session.id))
      const remaining = await engine.listSessions()
      assert.ok(
        !remaining.some((candidate) => candidate.id === session.id),
        'deleted session must not be listed',
      )
    }
  } finally {
    off()
  }

  return { sessionId: session.id, models: models.length }
}

function assertEventOrder(events: EngineEvent[], sessionId: string): void {
  const indexOfFirst = (predicate: (event: EngineEvent) => boolean): number =>
    events.findIndex(predicate)
  const messageIndex = indexOfFirst(
    (event) => event.type === 'message.upserted' && event.message.sessionId === sessionId,
  )
  const partIndex = indexOfFirst(
    (event) => event.type === 'part.upserted' && event.sessionId === sessionId,
  )
  const idleIndex = indexOfFirst(
    (event) =>
      event.type === 'session.runState' &&
      event.sessionId === sessionId &&
      event.runState === 'idle',
  )

  assert.ok(messageIndex >= 0, 'expected a message.upserted event')
  assert.ok(partIndex >= 0, 'expected a part.upserted event')
  assert.ok(idleIndex >= 0, 'expected a session.runState idle event')
  assert.ok(messageIndex < idleIndex, 'message must arrive before idle')
  assert.ok(partIndex < idleIndex, 'part must arrive before idle')
}
