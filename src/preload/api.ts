import type {
  EventChannel,
  EventContract,
  HandheldApi,
  InvokeChannel,
  InvokeContract,
} from '../shared/ipc'
import type { EngineEventPayload } from '../shared/engine'

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
      openExternal: (url) => invoke('app:openExternal', { url }),
      openLogDir: () => invoke('app:openLogDir'),
    },
    window: {
      setZoom: (factor) => invoke('window:setZoom', { factor }),
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
    engine: {
      capabilities: (engineId) => invoke('engine:capabilities', { engineId }),
      snapshot: (engineId) => invoke('engine:snapshot', { engineId }),
      listSessions: (engineId) => invoke('engine:listSessions', { engineId }),
      createSession: (opts, engineId) => invoke('engine:createSession', { opts, engineId }),
      deleteSession: (ref) => invoke('engine:deleteSession', { ref }),
      getMessages: (ref) => invoke('engine:getMessages', { ref }),
      setSessionModel: (ref, model) => invoke('engine:setSessionModel', { ref, model }),
      prompt: (ref, input) => invoke('engine:prompt', { ref, input }),
      abort: (ref) => invoke('engine:abort', { ref }),
      replyPermission: (ref, requestId, reply) =>
        invoke('engine:replyPermission', { ref, requestId, reply }),
      replyQuestion: (ref, requestId, answers) =>
        invoke('engine:replyQuestion', { ref, requestId, answers }),
      rejectQuestion: (ref, requestId) => invoke('engine:rejectQuestion', { ref, requestId }),
      listModels: (engineId) => invoke('engine:listModels', { engineId }),
      listCommands: (engineId) => invoke('engine:listCommands', { engineId }),
      runCommand: (ref, command, args) => invoke('engine:runCommand', { ref, command, args }),
      list: () => invoke('engine:list'),
      restart: (engineId) => invoke('engine:restart', { engineId }),
      onEvent: (listener) =>
        bridge.on('engine:event', (payload) => listener(payload as EngineEventPayload)),
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
