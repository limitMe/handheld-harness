import fs from 'node:fs'
import path from 'node:path'
import { DEFAULT_SETTINGS, SettingsSchema, type Settings, type SettingsPatch } from '../shared/ipc'

export interface SettingsStore {
  get(): Settings
  update(patch: SettingsPatch): Settings
}

function defaults(): Settings {
  return { schemaVersion: DEFAULT_SETTINGS.schemaVersion, window: { ...DEFAULT_SETTINGS.window } }
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
      })
      persist(next)
      current = next
      return current
    },
  }
}
