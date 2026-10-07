import { useEffect } from 'react'
import type { Settings } from '@shared/ipc'
import { applyLanguage } from '../i18n'

/**
 * Applies `settings.ui.language` to the i18n singleton and re-applies it when
 * the setting or the OS language changes (spec 20).
 */
export function useLanguageSync(): void {
  useEffect(() => {
    const bridge = window.handheld
    if (!bridge) return
    const apply = (settings: Settings): void => applyLanguage(settings.ui.language)
    const reload = (): void => {
      void bridge.settings
        .get()
        .then(apply)
        .catch(() => undefined)
    }
    window.addEventListener('languagechange', reload)
    reload()
    const off = bridge.events.on('settings:changed', apply)
    return () => {
      window.removeEventListener('languagechange', reload)
      off()
    }
  }, [])
}
