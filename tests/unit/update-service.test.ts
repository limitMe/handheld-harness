import { describe, expect, it, vi } from 'vitest'
import {
  createUpdateService,
  type UpdateEventName,
  type UpdateUpdater,
} from '../../src/main/update/service'

class FakeUpdater implements UpdateUpdater {
  autoDownload = true
  autoInstallOnAppQuit = true
  readonly handlers = new Map<string, (payload: unknown) => void>()
  quitAndInstall = vi.fn()

  on(event: UpdateEventName, listener: (payload: unknown) => void): void {
    this.handlers.set(event, listener)
  }

  emit(event: UpdateEventName, payload: unknown): void {
    this.handlers.get(event)?.(payload)
  }

  async checkForUpdates(): Promise<unknown> {
    this.emit('update-available', { version: '1.2.3', releaseNotes: 'Fixes' })
    return {}
  }

  async downloadUpdate(): Promise<unknown> {
    this.emit('download-progress', { percent: 42 })
    this.emit('update-downloaded', { version: '1.2.3' })
    return []
  }
}

describe('update service', () => {
  it('reports unavailable when the app is not packaged', async () => {
    const updater = new FakeUpdater()
    const service = createUpdateService({ isPackaged: false, loadUpdater: async () => updater })
    expect(await service.check()).toEqual({ state: 'unavailable' })
    expect(updater.handlers.size).toBe(0)
  })

  it('reports an available update with its release notes', async () => {
    const updater = new FakeUpdater()
    const service = createUpdateService({ isPackaged: true, loadUpdater: async () => updater })
    expect(await service.check()).toEqual({
      state: 'available',
      version: '1.2.3',
      notes: 'Fixes',
    })
    expect(updater.autoDownload).toBe(false)
    expect(updater.autoInstallOnAppQuit).toBe(false)
  })

  it('fetches release notes when the metadata omits them', async () => {
    const updater = new FakeUpdater()
    updater.checkForUpdates = async () => {
      updater.emit('update-available', { version: '1.2.3' })
      return {}
    }
    const fetchNotes = vi.fn(async () => 'from GitHub')
    const service = createUpdateService({
      isPackaged: true,
      loadUpdater: async () => updater,
      fetchNotes,
    })
    expect(await service.check()).toEqual({
      state: 'available',
      version: '1.2.3',
      notes: 'from GitHub',
    })
    expect(fetchNotes).toHaveBeenCalledWith('1.2.3')
  })

  it('tracks download progress and completion', async () => {
    const updater = new FakeUpdater()
    const service = createUpdateService({ isPackaged: true, loadUpdater: async () => updater })
    await service.check()
    expect(await service.download()).toEqual({ state: 'downloaded', version: '1.2.3' })
  })

  it('applies the update on install', async () => {
    const updater = new FakeUpdater()
    const service = createUpdateService({ isPackaged: true, loadUpdater: async () => updater })
    await service.check()
    service.install()
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true)
  })

  it('surfaces updater errors', async () => {
    const updater = new FakeUpdater()
    updater.checkForUpdates = async () => {
      updater.emit('error', new Error('network down'))
      return {}
    }
    const service = createUpdateService({ isPackaged: true, loadUpdater: async () => updater })
    expect(await service.check()).toEqual({ state: 'error', message: 'network down' })
  })

  it('notifies subscribers of status changes', async () => {
    const updater = new FakeUpdater()
    const service = createUpdateService({ isPackaged: true, loadUpdater: async () => updater })
    const seen: string[] = []
    service.subscribe((status) => seen.push(status.state))
    await service.check()
    expect(seen).toContain('checking')
    expect(seen).toContain('available')
  })
})
