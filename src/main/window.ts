import path from 'node:path'
import { BrowserWindow } from 'electron'
import type { WindowMode } from '../shared/ipc'
import { isDevMode } from './env'
import { log } from './log'

export function resolveWindowMode(): WindowMode {
  const raw = process.env.HANDHELD_WINDOW?.trim()
  if (raw === 'windowed' || raw === 'fullscreen') return raw
  return isDevMode() ? 'windowed' : 'fullscreen'
}

export function createMainWindow(backgroundColor: string): BrowserWindow {
  const win = new BrowserWindow({
    show: false,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      spellcheck: false,
    },
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    log.info('blocked window.open', { url })
    return { action: 'deny' }
  })

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const key = input.key.toLowerCase()
    if (input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen())
      event.preventDefault()
      return
    }
    if (input.control && input.shift && key === 'i') {
      win.webContents.toggleDevTools()
      event.preventDefault()
      return
    }
    if (input.control && !input.shift && key === 'r') {
      win.webContents.reload()
      event.preventDefault()
    }
  })

  win.once('ready-to-show', () => win.show())
  win.webContents.on('did-finish-load', () => log.info('renderer loaded', { url: win.webContents.getURL() }))

  // Renderer diagnostics: a blank window otherwise leaves no trace (spec 01).
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    log.error('renderer failed to load', { errorCode, errorDescription, validatedURL })
  })
  win.webContents.on('render-process-gone', (_event, details) => {
    log.error('renderer process gone', details)
  })
  win.webContents.on('unresponsive', () => log.warn('renderer unresponsive'))
  win.webContents.on('responsive', () => log.info('renderer responsive'))
  win.webContents.on('console-message', (details) => {
    if (details.level !== 'warning' && details.level !== 'error') return
    log[details.level === 'error' ? 'error' : 'warn'](`renderer console: ${details.message}`, {
      source: details.sourceId,
      line: details.lineNumber,
    })
  })

  if (resolveWindowMode() === 'fullscreen') {
    win.setFullScreen(true)
  } else {
    win.maximize()
  }

  const devServerUrl = process.env.ELECTRON_RENDERER_URL
  if (devServerUrl) {
    void win.loadURL(devServerUrl)
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return win
}
