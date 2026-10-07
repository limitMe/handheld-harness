import { useEffect } from 'react'
import type { Settings, ThemeMode } from '@shared/ipc'
import { applyTheme, resolveTheme } from './theme'

/**
 * Applies `settings.ui.theme` to <html> and re-applies it when the setting or
 * the OS preference changes (spec 18).
 */
export function useThemeSync(): void {
  useEffect(() => {
    const bridge = window.handheld
    if (!bridge) return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    let mode: ThemeMode = 'system'
    const render = (): void => applyTheme(resolveTheme(mode, media.matches))

    render()
    media.addEventListener('change', render)
    bridge.settings
      .get()
      .then((settings) => {
        mode = settings.ui.theme
        render()
      })
      .catch(() => undefined)
    const off = bridge.events.on('settings:changed', (settings: Settings) => {
      mode = settings.ui.theme
      render()
    })
    return () => {
      media.removeEventListener('change', render)
      off()
    }
  }, [])
}
