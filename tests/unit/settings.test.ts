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
    expect(createSettingsStore(target).get().ui).toEqual({
      lastSession: ref,
      zoom: 1.2,
      scrollSpeed: 1,
      theme: 'system',
    })

    store.update({ ui: { lastSession: null } })
    const reloaded = createSettingsStore(target).get().ui
    expect(reloaded.lastSession).toBeNull()
    expect(reloaded.zoom).toBe(1.2)
  })

  it('persists the theme selection and keeps the other ui fields', () => {
    const target = makeDir()
    const store = createSettingsStore(target)

    expect(store.get().ui.theme).toBe('system')

    store.update({ ui: { theme: 'light' } })
    expect(store.get().ui.theme).toBe('light')
    expect(createSettingsStore(target).get().ui.theme).toBe('light')
  })

  it('merges the hints slice and keeps untouched fields', () => {
    const target = makeDir()
    const store = createSettingsStore(target)

    store.update({ hints: { delayMs: 3000 } })
    expect(store.get().hints).toEqual({ enabled: true, delayMs: 3000 })

    store.update({ hints: { enabled: false } })
    expect(store.get().hints).toEqual({ enabled: false, delayMs: 3000 })
  })

  it('persists the task map slice and replaces arrays wholesale', () => {
    const target = makeDir()
    const store = createSettingsStore(target)
    const a = { engineId: 'fake', sessionId: 'ses_1' }
    const b = { engineId: 'fake', sessionId: 'ses_2' }

    store.update({ tasks: { open: [a] } })
    expect(store.get().tasks).toEqual({ open: [a], unread: [] })

    store.update({ tasks: { unread: [b] } })
    expect(store.get().tasks).toEqual({ open: [a], unread: [b] })
    expect(createSettingsStore(target).get().tasks).toEqual({ open: [a], unread: [b] })
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

  it('drops a whole context override when reset is requested', () => {
    const target = makeDir()
    const store = createSettingsStore(target)

    store.update({
      input: {
        contexts: { currentWork: { A: 'input.send' }, taskMap: { Y: 'task.new' } },
        keyboard: { textEdit: { X: 'sentence.delete' } },
      },
    })
    store.update({ input: { resetContexts: ['currentWork'] } })
    expect(store.get().input.contexts).toEqual({ taskMap: { Y: 'task.new' } })
    expect(createSettingsStore(target).get().input.contexts).toEqual({
      taskMap: { Y: 'task.new' },
    })

    store.update({ input: { resetKeyboard: ['textEdit'] } })
    expect(store.get().input.keyboard).toEqual({})
  })

  it('persists the default model and clears it with null', () => {
    const target = makeDir()
    const store = createSettingsStore(target)
    const model = { providerId: 'opencode', modelId: 'gpt-5' }

    store.update({ model: { default: model } })
    expect(store.get().model).toEqual({ default: model })
    expect(createSettingsStore(target).get().model).toEqual({ default: model })

    store.update({ model: { default: null } })
    expect(store.get().model).toEqual({ default: null })
  })

  it('drops user overrides of locked system shortcuts', () => {
    const target = makeDir()
    const store = createSettingsStore(target)

    store.update({
      input: { contexts: { global: { Start: null, 'RStickY+': 'menu.toggle' } } },
    })

    expect(store.get().input.contexts.global).toEqual({})
    expect(createSettingsStore(target).get().input.contexts.global).toEqual({})
  })

  it('heals a corrupted locked shortcut when loading settings.json', () => {
    const target = makeDir()
    writeFileSync(
      path.join(target, 'settings.json'),
      JSON.stringify({
        schemaVersion: 1,
        window: { mode: 'windowed' },
        input: { contexts: { global: { Start: null, X: 'map.toggle' } }, keyboard: {} },
      }),
    )

    const store = createSettingsStore(target)

    expect(store.get().input.contexts.global).toEqual({})
    expect(createSettingsStore(target).get().input.contexts.global).toEqual({})
  })
})
