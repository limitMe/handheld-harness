import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, type Settings } from '../../src/shared/ipc'
import type { SpeechEvent } from '../../src/shared/speech'
import type { CredentialStore } from '../../src/main/speech/credentials'
import { MOCK_INFO, createMockSpeechProvider } from '../../src/main/speech/mock'
import {
  SpeechNotConfiguredError,
  SpeechService,
  type SpeechProviderFactory,
} from '../../src/main/speech/service'

const credentials: CredentialStore = {
  has: () => false,
  get: () => undefined,
  set: () => undefined,
  clear: () => undefined,
}

function settingsWith(provider: string): Settings {
  return {
    ...DEFAULT_SETTINGS,
    speech: { ...DEFAULT_SETTINGS.speech, provider: provider as Settings['speech']['provider'] },
  }
}

function makeService(provider: string) {
  const events: SpeechEvent[] = []
  const factory: SpeechProviderFactory = {
    info: MOCK_INFO,
    create: (ctx) =>
      createMockSpeechProvider(ctx.emit, [
        { type: 'partial', text: 'hello' },
        { type: 'final', text: 'hello world' },
      ]),
  }
  const settings = settingsWith(provider)
  const service = new SpeechService(
    {
      getSettings: () => settings,
      credentials,
      emit: (event) => events.push(event),
      log: () => undefined,
    },
    [factory],
  )
  return { service, events }
}

describe('SpeechService', () => {
  it('lists the none sentinel plus every registered provider', () => {
    const { service } = makeService('none')
    expect(service.listProviders().map((provider) => provider.id)).toEqual(['none', 'mock'])
  })

  it('refuses to start without a configured provider', async () => {
    const { service } = makeService('none')
    await expect(service.start()).rejects.toBeInstanceOf(SpeechNotConfiguredError)
  })

  it('streams partial, final and level events through the active provider', async () => {
    const { service, events } = makeService('mock')
    const sessionId = await service.start()

    expect(events[0]).toEqual({ type: 'started', sessionId })
    service.pushAudio(sessionId, new Int16Array([32767, -32768]))
    expect(events.some((event) => event.type === 'partial')).toBe(true)
    expect(events.some((event) => event.type === 'level')).toBe(true)

    await service.stop(sessionId)
    expect(events.some((event) => event.type === 'final')).toBe(true)
    expect(events.at(-1)).toEqual({ type: 'ended', sessionId })
  })

  it('releases the slot after a session ends so the next one can start', async () => {
    const { service } = makeService('mock')
    const first = await service.start()
    await service.stop(first)
    await expect(service.start()).resolves.toEqual(expect.any(String))
  })

  it('cancel emits ended and releases the slot', async () => {
    const { service, events } = makeService('mock')
    const sessionId = await service.start()
    service.cancel(sessionId)
    expect(events.at(-1)).toEqual({ type: 'ended', sessionId })
    await expect(service.start()).resolves.toEqual(expect.any(String))
  })
})
