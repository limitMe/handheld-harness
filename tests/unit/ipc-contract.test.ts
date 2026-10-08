import { describe, expect, it } from 'vitest'
import { createHandheldApi, type IpcBridge } from '../../src/preload/api'
import {
  EVENT_CHANNELS,
  INVOKE_CHANNELS,
  type EventChannel,
  type InvokeChannel,
} from '../../src/shared/ipc'

const ref = { engineId: 'opencode', sessionId: 'ses_1' }

function createRecordingBridge() {
  const invoked: InvokeChannel[] = []
  const subscribed: EventChannel[] = []
  const bridge: IpcBridge = {
    invoke: (channel) => {
      invoked.push(channel)
      return Promise.resolve(undefined)
    },
    on: (channel) => {
      subscribed.push(channel)
      return () => undefined
    },
  }
  return { bridge, invoked, subscribed }
}

describe('IPC contract', () => {
  it('exposes every invoke channel exactly once through the preload API', async () => {
    const { bridge, invoked } = createRecordingBridge()
    const api = createHandheldApi(bridge)

    await api.app.getInfo()
    await api.app.openExternal('https://example.com')
    await api.app.openLogDir()
    await api.app.showOnScreenKeyboard()
    await api.window.setZoom(1)
    await api.settings.get()
    await api.settings.update({})
    api.log.write('info', 'hello')

    await api.engine.capabilities()
    await api.engine.snapshot()
    await api.engine.listSessions()
    await api.engine.createSession({ title: 't' })
    await api.engine.deleteSession(ref)
    await api.engine.getMessages(ref)
    await api.engine.setSessionModel(ref, { providerId: 'p', modelId: 'm' })
    await api.engine.prompt(ref, { text: 'hi' })
    await api.engine.abort(ref)
    await api.engine.replyPermission(ref, 'req', 'once')
    await api.engine.replyQuestion(ref, 'req', [['a']])
    await api.engine.rejectQuestion(ref, 'req')
    await api.engine.listModels()
    await api.engine.listCommands()
    await api.engine.runCommand(ref, 'compact')
    await api.engine.list()
    await api.engine.restart()

    await api.speech.providers()
    await api.speech.keyStatus('doubao')
    await api.speech.setKey('doubao', 'key')
    await api.speech.clearKey('doubao')
    await api.speech.start()
    await api.speech.pushAudio('ses', new Uint8Array([0, 0]))
    await api.speech.stop('ses')
    await api.speech.cancel('ses')

    expect(new Set(invoked)).toEqual(new Set(INVOKE_CHANNELS))
    expect(invoked).toHaveLength(INVOKE_CHANNELS.length)
  })

  it('maps every event channel through the preload API', () => {
    const { bridge, subscribed } = createRecordingBridge()
    const api = createHandheldApi(bridge)

    for (const channel of EVENT_CHANNELS) {
      api.events.on(channel, () => undefined)
    }
    api.engine.onEvent(() => undefined)
    api.speech.onEvent(() => undefined)

    expect(new Set(subscribed)).toEqual(new Set(EVENT_CHANNELS))
  })
})
