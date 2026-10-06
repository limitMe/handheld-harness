import os from 'node:os'
import path from 'node:path'

/** Mirrors Electron's `app.getPath('appData')` so standalone scripts find the registry. */
export function appDataDir(): string {
  if (process.platform === 'win32')
    return process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming')
  if (process.platform === 'darwin')
    return path.join(os.homedir(), 'Library', 'Application Support')
  return process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config')
}

export function serversDir(): string {
  return path.join(appDataDir(), 'handheld-ai', 'servers')
}
