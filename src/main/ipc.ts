import { app, ipcMain, type IpcMainInvokeEvent } from 'electron'
import {
  EVENT_CHANNELS,
  IPC_INVOKE_SCHEMAS,
  type InvokeChannel,
  type InvokeContract,
} from '../shared/ipc'
import { createSettingsStore, type SettingsStore } from './settings-store'
import { isDevMode } from './env'
import { log, writeLog } from './log'
import { resolveProfile } from './profile'
import { getEngineManager, startEngineRuntime } from './engine-runtime'

type Request<K extends InvokeChannel> = InvokeContract[K]['request']
type Response<K extends InvokeChannel> = InvokeContract[K]['response']

let store: SettingsStore | undefined

function settingsStore(): SettingsStore {
  store ??= createSettingsStore(app.getPath('userData'))
  return store
}

function handle<K extends InvokeChannel>(
  channel: K,
  handler: (request: Request<K>, event: IpcMainInvokeEvent) => Response<K> | Promise<Response<K>>,
): void {
  ipcMain.handle(channel, (event, payload) => {
    const parsed = IPC_INVOKE_SCHEMAS[channel].safeParse(payload)
    if (!parsed.success) {
      log.warn(`invalid IPC payload for ${channel}`, parsed.error.issues)
      throw new Error(`Invalid payload for ${channel}`)
    }
    return handler(parsed.data as Request<K>, event)
  })
}

export function registerIpc(): void {
  // Materialize settings.json (with defaults) on first launch.
  settingsStore()

  handle('app:getInfo', () => ({
    version: app.getVersion(),
    profile: resolveProfile(),
    platform: process.platform,
    isDev: isDevMode(),
  }))

  handle('log:write', (request) => {
    writeLog(request.level, request.message, request.meta)
  })

  handle('settings:get', () => settingsStore().get())

  handle('settings:update', (request, event) => {
    const next = settingsStore().update(request)
    event.sender.send(EVENT_CHANNELS[0], next)
    return next
  })

  registerEngineIpc()

  startEngineRuntime(() => settingsStore().get())
}

function registerEngineIpc(): void {
  handle('engine:capabilities', (request) =>
    getEngineManager().get(request?.engineId).capabilities(),
  )

  handle('engine:snapshot', (request) => getEngineManager().get(request?.engineId).snapshot())

  handle('engine:listSessions', (request) =>
    getEngineManager().get(request?.engineId).listSessions(),
  )

  handle('engine:createSession', (request) =>
    getEngineManager().get(request?.engineId).createSession(request?.opts),
  )

  handle('engine:deleteSession', ({ ref }) =>
    getEngineManager().getByRef(ref).deleteSession(ref.sessionId),
  )

  handle('engine:getMessages', ({ ref }) =>
    getEngineManager().getByRef(ref).getMessages(ref.sessionId),
  )

  handle('engine:setSessionModel', ({ ref, model }) =>
    getEngineManager().getByRef(ref).setSessionModel(ref.sessionId, model),
  )

  handle('engine:prompt', ({ ref, input }) =>
    getEngineManager().getByRef(ref).prompt(ref.sessionId, input),
  )

  handle('engine:abort', ({ ref }) => getEngineManager().getByRef(ref).abort(ref.sessionId))

  handle('engine:replyPermission', ({ ref, requestId, reply }) =>
    getEngineManager().getByRef(ref).replyPermission(ref.sessionId, requestId, reply),
  )

  handle('engine:replyQuestion', ({ ref, requestId, answers }) =>
    getEngineManager().getByRef(ref).replyQuestion(ref.sessionId, requestId, answers),
  )

  handle('engine:rejectQuestion', ({ ref, requestId }) =>
    getEngineManager().getByRef(ref).rejectQuestion(ref.sessionId, requestId),
  )

  handle('engine:listModels', (request) => getEngineManager().get(request?.engineId).listModels())

  handle('engine:listCommands', (request) =>
    getEngineManager().get(request?.engineId).listCommands(),
  )

  handle('engine:list', () => getEngineManager().list())

  handle('engine:restart', (request) => getEngineManager().restart(request?.engineId))
}
