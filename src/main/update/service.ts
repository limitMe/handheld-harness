import type { UpdateStatus } from '../../shared/ipc'
import { normalizeReleaseNotes } from './notes'

/** `electron-updater` events this service listens to. */
export type UpdateEventName =
  | 'update-available'
  | 'update-not-available'
  | 'download-progress'
  | 'update-downloaded'
  | 'error'

/** Minimal surface of `electron-updater`'s `autoUpdater` (spec 19). */
export interface UpdateUpdater {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  on(event: UpdateEventName, listener: (payload: unknown) => void): void
  checkForUpdates(): Promise<unknown>
  downloadUpdate(): Promise<unknown>
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void
}

export interface UpdateLogger {
  info(message: string, meta?: unknown): void
  warn(message: string, meta?: unknown): void
}

export interface UpdateServiceOptions {
  /** Packaged builds only; dev / unpackaged builds report `unavailable`. */
  isPackaged: boolean
  loadUpdater: () => Promise<UpdateUpdater>
  /** Fetches release notes when the update metadata carries none. */
  fetchNotes?: (version: string) => Promise<string | undefined>
  logger?: UpdateLogger
}

export interface UpdateService {
  getStatus(): UpdateStatus
  subscribe(listener: (status: UpdateStatus) => void): () => void
  check(): Promise<UpdateStatus>
  download(): Promise<UpdateStatus>
  install(): void
}

function versionOf(payload: unknown): string {
  if (typeof payload === 'object' && payload !== null) {
    const version = (payload as { version?: unknown }).version
    if (typeof version === 'string') return version
  }
  return ''
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function percentOf(progress: unknown): number {
  if (typeof progress === 'object' && progress !== null) {
    const percent = (progress as { percent?: unknown }).percent
    if (typeof percent === 'number' && Number.isFinite(percent)) {
      return Math.min(100, Math.max(0, Math.round(percent)))
    }
  }
  return 0
}

export function createUpdateService(options: UpdateServiceOptions): UpdateService {
  let status: UpdateStatus = { state: 'idle' }
  const listeners = new Set<(status: UpdateStatus) => void>()
  let updater: UpdateUpdater | undefined
  let loading: Promise<UpdateUpdater> | undefined
  let notesTask: Promise<void> | undefined

  const set = (next: UpdateStatus): void => {
    status = next
    for (const listener of listeners) listener(next)
  }

  const handleAvailable = async (info: unknown): Promise<void> => {
    const version = versionOf(info)
    let notes = normalizeReleaseNotes((info as { releaseNotes?: unknown } | null)?.releaseNotes)
    if (!notes && version && options.fetchNotes) {
      try {
        notes = await options.fetchNotes(version)
      } catch (error) {
        options.logger?.warn('update release notes fetch failed', messageOf(error))
      }
    }
    set({ state: 'available', version, notes })
  }

  const ensureUpdater = (): Promise<UpdateUpdater> => {
    loading ??= options.loadUpdater().then((next) => {
      next.autoDownload = false
      next.autoInstallOnAppQuit = false
      next.on('update-available', (info) => {
        notesTask = handleAvailable(info)
      })
      next.on('update-not-available', (info) =>
        set({ state: 'up-to-date', version: versionOf(info) }),
      )
      next.on('download-progress', (progress) =>
        set({ state: 'downloading', percent: percentOf(progress) }),
      )
      next.on('update-downloaded', (info) => set({ state: 'downloaded', version: versionOf(info) }))
      next.on('error', (error) => set({ state: 'error', message: messageOf(error) }))
      updater = next
      return next
    })
    return loading
  }

  return {
    getStatus: () => status,

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    async check() {
      if (!options.isPackaged) {
        set({ state: 'unavailable' })
        return status
      }
      set({ state: 'checking' })
      try {
        const active = await ensureUpdater()
        await active.checkForUpdates()
        await notesTask
      } catch (error) {
        set({ state: 'error', message: messageOf(error) })
      }
      return status
    },

    async download() {
      if (!updater) {
        set({ state: 'error', message: 'No update is available to download.' })
        return status
      }
      set({ state: 'downloading', percent: 0 })
      try {
        await updater.downloadUpdate()
      } catch (error) {
        set({ state: 'error', message: messageOf(error) })
      }
      return status
    },

    install() {
      updater?.quitAndInstall(false, true)
    },
  }
}
