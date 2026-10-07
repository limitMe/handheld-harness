import fs from 'node:fs'
import path from 'node:path'
import { DEFAULT_SETTINGS, SettingsSchema, type Settings, type SettingsPatch, type BindingPatch } from '../shared/ipc'
import { sanitizeUserBindings, type BindingLayer, type BindingValue } from '../shared/input'

export interface SettingsStore {
  get(): Settings
  update(patch: SettingsPatch): Settings
}

function defaults(): Settings {
  return {
    schemaVersion: DEFAULT_SETTINGS.schemaVersion,
    window: { ...DEFAULT_SETTINGS.window },
    engine: { ...DEFAULT_SETTINGS.engine },
    ui: { ...DEFAULT_SETTINGS.ui },
    hints: { ...DEFAULT_SETTINGS.hints },
    tasks: { open: [], unread: [] },
    model: {},
    input: { contexts: {}, keyboard: {} },
  }
}

function mergeRows(
  base: Record<string, Record<string, BindingValue>>,
  patch: Record<string, Record<string, BindingValue>>,
  reset: string[] | undefined,
): Record<string, Record<string, BindingValue>> {
  const out = { ...base }
  for (const context of reset ?? []) delete out[context]
  for (const [context, rows] of Object.entries(patch)) {
    out[context] = { ...(out[context] ?? {}), ...rows }
  }
  return out
}

function mergeBindingLayers(
  base: BindingLayer,
  patch: BindingPatch | undefined,
): BindingLayer {
  if (!patch) return base
  return {
    contexts: mergeRows(base.contexts, patch.contexts ?? {}, patch.resetContexts),
    keyboard: mergeRows(base.keyboard, patch.keyboard ?? {}, patch.resetKeyboard),
  }
}

export function createSettingsStore(userDataDir: string): SettingsStore {
  const file = path.join(userDataDir, 'settings.json')

  function backupInvalid(): void {
    if (!fs.existsSync(file)) return
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    try {
      fs.copyFileSync(file, path.join(userDataDir, `settings.invalid-${stamp}.json`))
    } catch {
      // Backup is best-effort; never block startup on it.
    }
  }

  function load(): Settings {
    if (!fs.existsSync(file)) {
      const initial = defaults()
      persist(initial)
      return initial
    }
    try {
      const parsed = SettingsSchema.safeParse(JSON.parse(fs.readFileSync(file, 'utf8')))
      if (!parsed.success) throw new Error(parsed.error.message)
      const input = sanitizeUserBindings(parsed.data.input)
      if (JSON.stringify(input) !== JSON.stringify(parsed.data.input)) {
        // Heal a corrupted remap of a locked system shortcut (spec 15).
        const fixed: Settings = { ...parsed.data, input }
        persist(fixed)
        return fixed
      }
      return parsed.data
    } catch {
      backupInvalid()
      return defaults()
    }
  }

  function persist(next: Settings): void {
    fs.mkdirSync(userDataDir, { recursive: true })
    const tmp = `${file}.tmp`
    fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    fs.renameSync(tmp, file)
  }

  let current = load()

  return {
    get: () => current,
    update(patch) {
      const next = SettingsSchema.parse({
        ...current,
        ...patch,
        window: { ...current.window, ...patch.window },
        engine: { ...current.engine, ...patch.engine },
        ui: { ...current.ui, ...patch.ui },
        hints: { ...current.hints, ...patch.hints },
        tasks: {
          open: patch.tasks?.open ?? current.tasks.open,
          unread: patch.tasks?.unread ?? current.tasks.unread,
        },
        model: { ...current.model, ...patch.model },
        input: sanitizeUserBindings(mergeBindingLayers(current.input, patch.input)),
      })
      persist(next)
      current = next
      return current
    },
  }
}
