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
})
