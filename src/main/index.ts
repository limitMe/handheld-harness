import path from 'node:path'
import { app, BrowserWindow, screen } from 'electron'
import { log } from './log'
import { applySavedZoom, registerIpc, resolveSavedTheme } from './ipc'
import { installPermissions } from './permissions'
import { resolveProfile } from './profile'
import { stopEngineRuntime } from './engine-runtime'
import { createMainWindow, resolveWindowMode } from './window'
import { THEME_SURFACE_COLOR } from '../shared/theme'

const profile = resolveProfile()
app.setPath('userData', path.join(app.getPath('appData'), 'handheld-harness', profile))

let mainWindow: BrowserWindow | null = null

function logStartupInfo(): void {
  const display = screen.getPrimaryDisplay()
  log.info('startup', {
    version: app.getVersion(),
    profile,
    windowMode: resolveWindowMode(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    display: {
      width: display.size.width,
      height: display.size.height,
      scaleFactor: display.scaleFactor,
    },
  })
}

function focusMainWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', focusMainWindow)

  app.whenReady().then(() => {
    installPermissions()
    registerIpc()
    logStartupInfo()
    mainWindow = createMainWindow(THEME_SURFACE_COLOR[resolveSavedTheme()])
    applySavedZoom(mainWindow)
    mainWindow.on('closed', () => {
      mainWindow = null
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow(THEME_SURFACE_COLOR[resolveSavedTheme()])
      } else {
        focusMainWindow()
      }
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    stopEngineRuntime()
  })
}
