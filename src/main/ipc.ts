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

type Request<K extends InvokeChannel> = InvokeContract[K]['request']
type Response<K extends InvokeChannel> = InvokeContract[K]['response']

let store: SettingsStore | undefined

function settingsStore(): SettingsStore {
  store ??= createSettingsStore(app.getPath('userData'))
  return store
}

function handle<K extends InvokeChannel>(
  channel: K,
  handler: (request: Request<K>, event: IpcMainInvokeEvent) => Response<K>,
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
}
