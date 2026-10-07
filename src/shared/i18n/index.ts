import { en } from './locales/en'
import { zh } from './locales/zh'

/**
 * Language layer (spec 20). `system` follows the OS language; the concrete
 * resource languages are English and Simplified Chinese, with English as the
 * fallback. The catalogs are shared so main and renderer stay in sync.
 */
export const LANGUAGE_MODES = ['system', 'en', 'zh'] as const
export type LanguageMode = (typeof LANGUAGE_MODES)[number]

export const RESOURCE_LANGUAGES = ['en', 'zh'] as const
export type ResourceLanguage = (typeof RESOURCE_LANGUAGES)[number]

export const DEFAULT_LANGUAGE: LanguageMode = 'system'
export const FALLBACK_LANGUAGE: ResourceLanguage = 'en'

/** Maps a language mode onto a concrete catalog, resolving `system` by locale. */
export function resolveLanguage(mode: LanguageMode, systemLanguage: string): ResourceLanguage {
  if (mode !== 'system') return mode
  return systemLanguage.toLowerCase().startsWith('zh') ? 'zh' : FALLBACK_LANGUAGE
}

export const resources = {
  en: { translation: en },
  zh: { translation: zh },
} as const

export function isLanguageMode(value: string): value is LanguageMode {
  return (LANGUAGE_MODES as readonly string[]).includes(value)
}
