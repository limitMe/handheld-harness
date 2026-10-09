import { app, BrowserWindow } from 'electron'
import { log } from '../log'
import { fetchReleaseNotes } from './notes'
import { createUpdateService } from './service'
import { loadElectronUpdater } from './updater-loader'

/** Main-process singleton; renderer talks to it through the `update:*` IPC. */
export const updateService = createUpdateService({
  isPackaged: app.isPackaged,
  loadUpdater: loadElectronUpdater,
  fetchNotes: (version) => fetchReleaseNotes(version),
  logger: {
    info: (message, meta) => log.info(message, meta),
    warn: (message, meta) => log.warn(message, meta),
  },
})

let started = false

/** Forwards every status change to all renderer windows (called once). */
export function startUpdateRuntime(): void {
  if (started) return
  started = true
  updateService.subscribe((status) => {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('update:event', status)
  })
}
