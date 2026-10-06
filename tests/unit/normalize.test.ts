import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalize } from '../../src/main/engine/opencode/normalize'
import type { ChatPart, EngineEvent } from '../../src/shared/engine'

const FIXTURE = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'opencode',
  '1.18.34',
  'basic-tool-permission.jsonl',
)

function loadFixture(): EngineEvent[] {
  const lines = fs.readFileSync(FIXTURE, 'utf8').split('\n').filter(Boolean)
  return lines.flatMap((line) => normalize(JSON.parse(line)))
}

function tools(events: EngineEvent[]): Extract<ChatPart, { type: 'tool' }>[] {
  return events.flatMap((event) =>
    event.type === 'part.upserted' && event.part.type === 'tool' ? [event.part] : [],
  )
}

describe('normalize (recorded fixture)', () => {
  const events = loadFixture()

  it('maps text parts and merges deltas into the final text', () => {
    const deltas = events
      .filter((event) => event.type === 'part.delta')
      .map((event) => (event.type === 'part.delta' ? event.delta : ''))
    const textParts = events.flatMap((event) =>
      event.type === 'part.upserted' && event.part.type === 'text' ? [event.part.text] : [],
    )
    expect(deltas.join('')).toContain('DONE')
    expect(textParts.join('\n')).toContain('DONE')
  })

  it('walks a tool through pending, running and completed', () => {
    const states = tools(events).map((part) => part.state)
    expect(states).toContain('pending')
    expect(states).toContain('running')
    expect(states).toContain('completed')
    const completed = tools(events).find((part) => part.state === 'completed')
    expect(completed?.tool).toBe('bash')
    expect(completed?.output).toContain('v')
  })

  it('maps permission.asked and permission.replied', () => {
    const asked = events.find((event) => event.type === 'permission.asked')
    expect(asked?.type).toBe('permission.asked')
    if (asked?.type === 'permission.asked') {
      expect(asked.request.kind).toBe('bash')
      expect(asked.request.patterns).toContain('node -v')
      expect(asked.request.title).toBe('node -v')
    }
    expect(events.some((event) => event.type === 'permission.replied')).toBe(true)
  })

  it('tracks the session moving through busy to idle', () => {
    const states = events.flatMap((event) =>
      event.type === 'session.runState' ? [event.runState] : [],
    )
    expect(states).toContain('busy')
    expect(states).toContain('idle')
    expect(states.indexOf('busy')).toBeLessThan(states.lastIndexOf('idle'))
  })

  it('emits message and part events before idle', () => {
    const indexOf = (predicate: (event: EngineEvent) => boolean): number =>
      events.findIndex(predicate)
    const message = indexOf((event) => event.type === 'message.upserted')
    const part = indexOf((event) => event.type === 'part.upserted')
    const idle = indexOf((event) => event.type === 'session.runState' && event.runState === 'idle')
    expect(message).toBeGreaterThanOrEqual(0)
    expect(part).toBeGreaterThanOrEqual(0)
    expect(message).toBeLessThan(idle)
    expect(part).toBeLessThan(idle)
  })

  it('ignores unknown or informational events without throwing', () => {
    const raw = { id: 'evt_x', type: 'plugin.added', properties: { id: 'agent' } }
    expect(normalize(raw)).toEqual([])
    expect(normalize({ id: 'evt_y', type: 'totally.unknown', properties: {} })).toEqual([])
    expect(normalize({})).toEqual([])
    expect(normalize(null)).toEqual([])
  })
})

describe('normalize (fields)', () => {
  it('maps an assistant message with model and completion time', () => {
    const events = normalize({
      type: 'message.updated',
      properties: {
        sessionID: 'ses_1',
        info: {
          id: 'msg_1',
          sessionID: 'ses_1',
          role: 'assistant',
          time: { created: 10, completed: 20 },
          providerID: 'deepseek',
          modelID: 'deepseek-v4-pro',
        },
      },
    })
    expect(events).toEqual([
      {
        type: 'message.upserted',
        message: {
          id: 'msg_1',
          sessionId: 'ses_1',
          role: 'assistant',
          createdAt: 10,
          completedAt: 20,
          model: { providerId: 'deepseek', modelId: 'deepseek-v4-pro' },
          error: undefined,
        },
      },
    ])
  })

  it('maps session.updated to a summary', () => {
    const events = normalize({
      type: 'session.updated',
      properties: {
        sessionID: 'ses_1',
        info: {
          id: 'ses_1',
          title: 'Hello',
          parentID: 'ses_parent',
          time: { created: 1, updated: 2 },
          model: { id: 'm', providerID: 'p' },
        },
      },
    })
    expect(events[0]).toMatchObject({
      type: 'session.upserted',
      session: {
        id: 'ses_1',
        title: 'Hello',
        parentId: 'ses_parent',
        createdAt: 1,
        updatedAt: 2,
        runState: 'idle',
        model: { providerId: 'p', modelId: 'm' },
      },
    })
  })

  it('maps question.asked and rejects malformed questions', () => {
    const asked = normalize({
      type: 'question.asked',
      properties: {
        id: 'q1',
        sessionID: 'ses_1',
        questions: [
          {
            header: 'Pick',
            question: 'Which one?',
            multiple: true,
            options: [{ label: 'A', description: 'first' }],
          },
        ],
      },
    })
    expect(asked[0]).toMatchObject({
      type: 'question.asked',
      request: {
        id: 'q1',
        sessionId: 'ses_1',
        questions: [{ question: 'Which one?', multiple: true }],
      },
    })
    expect(normalize({ type: 'question.asked', properties: { id: 'q2', sessionID: 's' } })).toEqual(
      [],
    )
  })

  it('maps the v2 permission naming variant', () => {
    const events = normalize({
      type: 'permission.v2.asked',
      properties: { id: 'per_1', sessionID: 'ses_1', action: 'bash', resources: ['npm test'] },
    })
    expect(events[0]).toMatchObject({
      type: 'permission.asked',
      request: { kind: 'bash', patterns: ['npm test'], title: 'npm test' },
    })
  })

  it('drops non-text deltas', () => {
    const base = {
      type: 'message.part.delta',
      properties: { sessionID: 's', messageID: 'm', partID: 'p', delta: 'x' },
    }
    expect(normalize({ ...base, properties: { ...base.properties, field: 'text' } })).toHaveLength(
      1,
    )
    expect(normalize({ ...base, properties: { ...base.properties, field: 'input' } })).toHaveLength(
      0,
    )
  })
})
