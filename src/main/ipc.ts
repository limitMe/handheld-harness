import { app, BrowserWindow, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import path from 'node:path'
import {
  EVENT_CHANNELS,
  IPC_INVOKE_SCHEMAS,
  type InvokeChannel,
  type InvokeContract,
} from '../shared/ipc'
import { isAllowedExternalUrl } from '../shared/url'
import { createSettingsStore, type SettingsStore } from './settings-store'
import { isDevMode } from './env'
import { log, writeLog } from './log'
import { resolveProfile } from './profile'
import { getEngineManager, startEngineRuntime } from './engine-runtime'
import { clampZoom } from './zoom'

type Request<K extends InvokeChannel> = InvokeContract[K]['request']
type Response<K extends InvokeChannel> = InvokeContract[K]['response']

let store: SettingsStore | undefined

function settingsStore(): SettingsStore {
  store ??= createSettingsStore(app.getPath('userData'))
  return store
}

/** Applies the persisted zoom factor to a freshly created window. */
export function applySavedZoom(win: BrowserWindow): void {
  win.webContents.setZoomFactor(clampZoom(settingsStore().get().ui.zoom))
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

  handle('app:openExternal', async ({ url }) => {
    if (!isAllowedExternalUrl(url)) {
      log.warn('rejected external url', { url })
      throw new Error('Only http and https links can be opened')
    }
    await shell.openExternal(url)
  })

  // Opens the profile's log folder (spec 15, About & diagnostics).
  handle('app:openLogDir', async () => {
    const dir = path.join(app.getPath('userData'), 'logs')
    await shell.openPath(dir)
  })

  handle('window:setZoom', ({ factor }, event) => {
    const zoom = clampZoom(factor)
    BrowserWindow.fromWebContents(event.sender)?.webContents.setZoomFactor(zoom)
    const next = settingsStore().update({ ui: { zoom } })
    event.sender.send(EVENT_CHANNELS[0], next)
    return { zoom }
  })

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

  handle('engine:runCommand', ({ ref, command, args }) =>
    getEngineManager().getByRef(ref).runCommand(ref.sessionId, command, args),
  )

  handle('engine:list', () => getEngineManager().list())

  handle('engine:restart', (request) => getEngineManager().restart(request?.engineId))
}
