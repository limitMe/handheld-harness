import { describe, expect, it } from 'vitest'
import { createHandheldApi, type IpcBridge } from '../../src/preload/api'
import { EVENT_CHANNELS, INVOKE_CHANNELS, type EventChannel, type InvokeChannel } from '../../src/shared/ipc'

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
    await api.settings.get()
    await api.settings.update({})
    api.log.write('info', 'hello')

    expect(new Set(invoked)).toEqual(new Set(INVOKE_CHANNELS))
    expect(invoked).toHaveLength(INVOKE_CHANNELS.length)
  })

  it('maps every event channel through the preload API', () => {
    const { bridge, subscribed } = createRecordingBridge()
    const api = createHandheldApi(bridge)

    for (const channel of EVENT_CHANNELS) {
      api.events.on(channel, () => undefined)
    }

    expect(new Set(subscribed)).toEqual(new Set(EVENT_CHANNELS))
  })
})
