import i18next from 'i18next'
import { initReactI18next, useTranslation } from 'react-i18next'
import {
  FALLBACK_LANGUAGE,
  RESOURCE_LANGUAGES,
  resolveLanguage,
  resources,
  type LanguageMode,
} from '@shared/i18n'

/** Translate function shape passed to pure helpers such as `formatRelativeTime`. */
export type Translate = (key: string, options?: Record<string, unknown>) => string

function systemLanguage(): string {
  return typeof navigator !== 'undefined' && navigator.language
    ? navigator.language
    : FALLBACK_LANGUAGE
}

/**
 * Renderer-side i18n singleton (spec 20). `initReactI18next` registers it as the
 * default instance, so components can use `useTranslation` without a provider
 * and non-React code (stores) can call `i18n.t` directly.
 */
void i18next.use(initReactI18next).init({
  resources,
  lng: resolveLanguage('system', systemLanguage()),
  fallbackLng: FALLBACK_LANGUAGE,
  supportedLngs: [...RESOURCE_LANGUAGES],
  interpolation: { escapeValue: false },
  initAsync: false,
  returnNull: false,
})

/** Applies a language mode, resolving `system` against the current OS locale. */
export function applyLanguage(mode: LanguageMode): void {
  const next = resolveLanguage(mode, systemLanguage())
  if (i18next.resolvedLanguage !== next) void i18next.changeLanguage(next)
}

export const i18n = i18next
export { useTranslation }
