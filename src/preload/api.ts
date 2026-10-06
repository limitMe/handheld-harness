import type {
  EventChannel,
  EventContract,
  HandheldApi,
  InvokeChannel,
  InvokeContract,
} from '../shared/ipc'

/** Minimal surface of `ipcRenderer` used by the preload bridge, kept injectable for tests. */
export interface IpcBridge {
  invoke(channel: InvokeChannel, payload?: unknown): Promise<unknown>
  on(channel: EventChannel, listener: (payload: unknown) => void): () => void
}

export function createHandheldApi(bridge: IpcBridge): HandheldApi {
  function invoke<K extends InvokeChannel>(
    channel: K,
    payload?: InvokeContract[K]['request'],
  ): Promise<InvokeContract[K]['response']> {
    return bridge.invoke(channel, payload) as Promise<InvokeContract[K]['response']>
  }

  return {
    app: {
      getInfo: () => invoke('app:getInfo'),
    },
    log: {
      write: (level, message, meta) => {
        void invoke('log:write', { level, message, meta })
      },
    },
    settings: {
      get: () => invoke('settings:get'),
      update: (patch) => invoke('settings:update', patch),
    },
    events: {
      on: <K extends EventChannel>(
        channel: K,
        listener: (payload: EventContract[K]['payload']) => void,
      ) => {
        return bridge.on(channel, (payload) => listener(payload as EventContract[K]['payload']))
      },
    },
  }
}
