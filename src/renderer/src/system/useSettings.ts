import { useCallback, useEffect, useState } from 'react'
import type { Settings, SettingsPatch } from '@shared/ipc'

export interface SettingsController {
  settings: Settings | undefined
  update: (patch: SettingsPatch) => Promise<void>
}

/** Loads the profile settings and keeps them in sync with menu-driven updates. */
export function useSettings(): SettingsController {
  const [settings, setSettings] = useState<Settings>()

  useEffect(() => {
    const bridge = window.handheld
    if (!bridge) return
    let disposed = false
    bridge.settings
      .get()
      .then((next) => {
        if (!disposed) setSettings(next)
      })
      .catch(() => undefined)
    const off = bridge.events.on('settings:changed', (next) => setSettings(next))
    return () => {
      disposed = true
      off()
    }
  }, [])

  const update = useCallback(async (patch: SettingsPatch): Promise<void> => {
    const next = await window.handheld.settings.update(patch)
    setSettings(next)
  }, [])

  return { settings, update }
}
