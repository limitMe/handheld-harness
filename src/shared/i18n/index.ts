import { de } from './locales/de'
import { en } from './locales/en'
import { es } from './locales/es'
import { fr } from './locales/fr'
import { ja } from './locales/ja'
import { ko } from './locales/ko'
import { ru } from './locales/ru'
import { zhHant } from './locales/zh-Hant'
import { zh } from './locales/zh'

/**
 * Language layer (spec 20). `system` follows the OS language; the concrete
 * resource languages are English and Simplified Chinese plus a set that is
 * open-ended. Secondary catalogs may lag behind `en`/`zh` and fall back to
 * English until the next i18n alignment commit. Catalogs are shared so main and
 * renderer stay in sync.
 */
export const LANGUAGE_MODES = [
  'system',
  'en',
  'zh',
  'zh-Hant',
  'ja',
  'ko',
  'es',
  'fr',
  'de',
  'ru',
] as const
export type LanguageMode = (typeof LANGUAGE_MODES)[number]

export const RESOURCE_LANGUAGES = [
  'en',
  'zh',
  'zh-Hant',
  'ja',
  'ko',
  'es',
  'fr',
  'de',
  'ru',
] as const
export type ResourceLanguage = (typeof RESOURCE_LANGUAGES)[number]

export const DEFAULT_LANGUAGE: LanguageMode = 'system'
export const FALLBACK_LANGUAGE: ResourceLanguage = 'en'

/**
 * Maps a system locale onto a concrete catalog. Traditional Chinese locales use
 * `zh-Hant`, every other `zh-*` locale uses `zh`, and the remaining languages
 * match by primary subtag; anything unknown falls back to English.
 */
export function resolveLanguage(mode: LanguageMode, systemLanguage: string): ResourceLanguage {
  if (mode !== 'system') return mode
  const locale = systemLanguage.toLowerCase()
  if (locale === 'zh' || locale.startsWith('zh-')) {
    return /^zh-(hant|tw|hk|mo)(-|$)/.test(locale) ? 'zh-Hant' : 'zh'
  }
  for (const language of RESOURCE_LANGUAGES) {
    if (language === FALLBACK_LANGUAGE || language === 'zh' || language === 'zh-Hant') continue
    if (locale === language || locale.startsWith(`${language}-`)) return language
  }
  return FALLBACK_LANGUAGE
}

export const resources = {
  en: { translation: en },
  zh: { translation: zh },
  'zh-Hant': { translation: zhHant },
  ja: { translation: ja },
  ko: { translation: ko },
  es: { translation: es },
  fr: { translation: fr },
  de: { translation: de },
  ru: { translation: ru },
} as const

export function isLanguageMode(value: string): value is LanguageMode {
  return (LANGUAGE_MODES as readonly string[]).includes(value)
}
