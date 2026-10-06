import path from 'node:path'
import { app } from 'electron'
import log from 'electron-log/main'
import type { LogLevel } from '../shared/ipc'

log.transports.file.resolvePathFn = () => path.join(app.getPath('userData'), 'logs', 'main.log')
log.transports.file.level = 'info'
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'
log.transports.console.level = app.isPackaged ? 'warn' : 'debug'

export function writeLog(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  if (meta) {
    log[level](message, meta)
  } else {
    log[level](message)
  }
}

export { log }
