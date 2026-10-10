import { describe, expect, it } from 'vitest'
import { ACTION_IDS } from '../../src/shared/actions'
import { CONTEXT_LABELS } from '../../src/shared/bindings'
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_MODES,
  RESOURCE_LANGUAGES,
  resolveLanguage,
  resources,
} from '../../src/shared/i18n'
import { de } from '../../src/shared/i18n/locales/de'
import { en } from '../../src/shared/i18n/locales/en'
import { es } from '../../src/shared/i18n/locales/es'
import { fr } from '../../src/shared/i18n/locales/fr'
import { ja } from '../../src/shared/i18n/locales/ja'
import { ko } from '../../src/shared/i18n/locales/ko'
import { ru } from '../../src/shared/i18n/locales/ru'
import type { TranslationCatalog } from '../../src/shared/i18n/locales/types'
import { zhHant } from '../../src/shared/i18n/locales/zh-Hant'
import { zh } from '../../src/shared/i18n/locales/zh'

function flatten(catalog: TranslationCatalog, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  for (const [key, value] of Object.entries(catalog)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') out.set(path, value)
    else for (const [nested, text] of flatten(value, path)) out.set(nested, text)
  }
  return out
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1] ?? '').sort()
}

const enLeaves = flatten(en)
const zhLeaves = flatten(zh)

/** Catalogs that follow `en`/`zh` and may lag until the next i18n alignment. */
const secondaryCatalogs = {
  'zh-Hant': zhHant,
  ja,
  ko,
  es,
  fr,
  de,
  ru,
} as const

describe('language resolution', () => {
  it('defaults to following the system language', () => {
    expect(DEFAULT_LANGUAGE).toBe('system')
    expect(LANGUAGE_MODES).toEqual([
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
    ])
  })

  it('maps the system locale onto a supported catalog, falling back to English', () => {
    expect(resolveLanguage('system', 'zh-CN')).toBe('zh')
    expect(resolveLanguage('system', 'zh-Hans-CN')).toBe('zh')
    expect(resolveLanguage('system', 'zh-SG')).toBe('zh')
    expect(resolveLanguage('system', 'zh-TW')).toBe('zh-Hant')
    expect(resolveLanguage('system', 'zh-Hant-TW')).toBe('zh-Hant')
    expect(resolveLanguage('system', 'zh-HK')).toBe('zh-Hant')
    expect(resolveLanguage('system', 'ja-JP')).toBe('ja')
    expect(resolveLanguage('system', 'ko-KR')).toBe('ko')
    expect(resolveLanguage('system', 'es-ES')).toBe('es')
    expect(resolveLanguage('system', 'fr-FR')).toBe('fr')
    expect(resolveLanguage('system', 'de-DE')).toBe('de')
    expect(resolveLanguage('system', 'ru-RU')).toBe('ru')
    expect(resolveLanguage('system', 'en-US')).toBe('en')
    expect(resolveLanguage('system', 'pt-BR')).toBe('en')
    expect(resolveLanguage('system', '')).toBe('en')
  })

  it('honors an explicit mode over the system locale', () => {
    expect(resolveLanguage('en', 'zh-CN')).toBe('en')
    expect(resolveLanguage('zh', 'en-US')).toBe('zh')
    expect(resolveLanguage('zh-Hant', 'zh-CN')).toBe('zh-Hant')
    expect(resolveLanguage('ja', 'de-DE')).toBe('ja')
  })

  it('exposes every catalog as an i18next resource', () => {
    expect(Object.keys(resources).sort()).toEqual([...RESOURCE_LANGUAGES].sort())
    expect(resources.en.translation).toBe(en)
    expect(resources.zh.translation).toBe(zh)
  })
})

describe('catalog parity', () => {
  it('covers exactly the same keys in both core languages', () => {
    expect([...zhLeaves.keys()].sort()).toEqual([...enLeaves.keys()].sort())
  })

  it('has no empty strings in any catalog', () => {
    for (const [key, value] of [...enLeaves, ...zhLeaves]) {
      expect(value.trim(), key).not.toBe('')
    }
    for (const [language, catalog] of Object.entries(secondaryCatalogs)) {
      for (const [key, value] of flatten(catalog)) {
        expect(value.trim(), `${language}:${key}`).not.toBe('')
      }
    }
  })

  it('uses the same interpolation placeholders in both core languages', () => {
    for (const [key, value] of enLeaves) {
      expect(placeholders(zhLeaves.get(key) ?? ''), key).toEqual(placeholders(value))
    }
  })

  it('lets secondary catalogs lag but never contain unknown keys', () => {
    for (const [language, catalog] of Object.entries(secondaryCatalogs)) {
      for (const [key, value] of flatten(catalog)) {
        expect(enLeaves.has(key), `${language}:${key}`).toBe(true)
        expect(placeholders(value), `${language}:${key}`).toEqual(
          placeholders(enLeaves.get(key) ?? ''),
        )
      }
    }
  })

  it('translates every action id in the core languages', () => {
    for (const id of ACTION_IDS) {
      expect(enLeaves.get(`actions.${id}`), id).toBeTruthy()
      expect(zhLeaves.get(`actions.${id}`), id).toBeTruthy()
    }
  })

  it('translates every binding context in the core languages', () => {
    for (const context of Object.keys(CONTEXT_LABELS)) {
      expect(enLeaves.get(`contexts.${context}`), context).toBeTruthy()
      expect(zhLeaves.get(`contexts.${context}`), context).toBeTruthy()
    }
  })
})
