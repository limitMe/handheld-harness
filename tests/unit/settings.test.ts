import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createSettingsStore } from '../../src/main/settings-store'
import { DEFAULT_SETTINGS } from '../../src/shared/ipc'

let dir: string | undefined

function makeDir(): string {
  dir = mkdtempSync(path.join(tmpdir(), 'hha-settings-'))
  return dir
}

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
  dir = undefined
})

describe('settings store', () => {
  it('returns defaults and materializes settings.json when no file exists', () => {
    const target = makeDir()
    const store = createSettingsStore(target)
    expect(store.get()).toEqual(DEFAULT_SETTINGS)
    expect(readdirSync(target)).toContain('settings.json')
  })

  it('backs up invalid JSON and falls back to defaults', () => {
    const target = makeDir()
    writeFileSync(path.join(target, 'settings.json'), '{ not valid json')

    const store = createSettingsStore(target)

    expect(store.get()).toEqual(DEFAULT_SETTINGS)
    expect(readdirSync(target).some((name) => name.startsWith('settings.invalid-'))).toBe(true)
  })

  it('backs up a schema violation and falls back to defaults', () => {
    const target = makeDir()
    writeFileSync(path.join(target, 'settings.json'), JSON.stringify({ schemaVersion: 99 }))

    const store = createSettingsStore(target)

    expect(store.get()).toEqual(DEFAULT_SETTINGS)
    expect(readdirSync(target).some((name) => name.startsWith('settings.invalid-'))).toBe(true)
  })

  it('persists updates and reloads them', () => {
    const target = makeDir()
    const store = createSettingsStore(target)

    const updated = store.update({ window: { mode: 'fullscreen' } })

    expect(updated.window.mode).toBe('fullscreen')
    expect(createSettingsStore(target).get().window.mode).toBe('fullscreen')
  })

  it('persists the ui slice and can clear lastSession with null', () => {
    const target = makeDir()
    const store = createSettingsStore(target)
    const ref = { engineId: 'fake', sessionId: 'ses_1' }

    store.update({ ui: { lastSession: ref, zoom: 1.2 } })
    expect(createSettingsStore(target).get().ui).toEqual({ lastSession: ref, zoom: 1.2 })

    store.update({ ui: { lastSession: null } })
    const reloaded = createSettingsStore(target).get().ui
    expect(reloaded.lastSession).toBeNull()
    expect(reloaded.zoom).toBe(1.2)
  })

  it('merges the hints slice and keeps untouched fields', () => {
    const target = makeDir()
    const store = createSettingsStore(target)

    store.update({ hints: { delayMs: 3000 } })
    expect(store.get().hints).toEqual({ enabled: true, delayMs: 3000 })

    store.update({ hints: { enabled: false } })
    expect(store.get().hints).toEqual({ enabled: false, delayMs: 3000 })
  })

  it('merges input bindings deeply and preserves explicit unbinds', () => {
    const target = makeDir()
    const store = createSettingsStore(target)

    store.update({ input: { contexts: { currentWork: { A: 'input.send' } } } })
    store.update({ input: { contexts: { currentWork: { B: 'input.send' } } } })
    expect(store.get().input.contexts.currentWork).toEqual({ A: 'input.send', B: 'input.send' })

    store.update({ input: { contexts: { currentWork: { A: null } } } })
    expect(store.get().input.contexts.currentWork).toEqual({ A: null, B: 'input.send' })
    expect(createSettingsStore(target).get().input.contexts.currentWork).toEqual({
      A: null,
      B: 'input.send',
    })
  })
})
