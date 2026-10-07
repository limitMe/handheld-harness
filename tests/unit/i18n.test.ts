import { describe, expect, it } from 'vitest'
import { ACTION_IDS } from '../../src/shared/actions'
import { CONTEXT_LABELS } from '../../src/shared/bindings'
import { DEFAULT_LANGUAGE, LANGUAGE_MODES, resolveLanguage, resources } from '../../src/shared/i18n'
import { en } from '../../src/shared/i18n/locales/en'
import type { TranslationCatalog } from '../../src/shared/i18n/locales/types'
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

describe('language resolution', () => {
  it('defaults to following the system language', () => {
    expect(DEFAULT_LANGUAGE).toBe('system')
    expect(LANGUAGE_MODES).toEqual(['system', 'en', 'zh'])
  })

  it('maps the system locale onto a supported catalog, falling back to English', () => {
    expect(resolveLanguage('system', 'zh-CN')).toBe('zh')
    expect(resolveLanguage('system', 'zh-Hans-CN')).toBe('zh')
    expect(resolveLanguage('system', 'en-US')).toBe('en')
    expect(resolveLanguage('system', 'de-DE')).toBe('en')
  })

  it('honors an explicit mode over the system locale', () => {
    expect(resolveLanguage('en', 'zh-CN')).toBe('en')
    expect(resolveLanguage('zh', 'en-US')).toBe('zh')
  })

  it('exposes both catalogs as i18next resources', () => {
    expect(Object.keys(resources).sort()).toEqual(['en', 'zh'])
    expect(resources.en.translation).toBe(en)
  })
})

describe('catalog parity', () => {
  it('covers exactly the same keys in both languages', () => {
    expect([...zhLeaves.keys()].sort()).toEqual([...enLeaves.keys()].sort())
  })

  it('has no empty strings', () => {
    for (const [key, value] of [...enLeaves, ...zhLeaves]) {
      expect(value.trim(), key).not.toBe('')
    }
  })

  it('uses the same interpolation placeholders in both languages', () => {
    for (const [key, value] of enLeaves) {
      expect(placeholders(zhLeaves.get(key) ?? ''), key).toEqual(placeholders(value))
    }
  })

  it('translates every action id', () => {
    for (const id of ACTION_IDS) {
      expect(enLeaves.get(`actions.${id}`), id).toBeTruthy()
      expect(zhLeaves.get(`actions.${id}`), id).toBeTruthy()
    }
  })

  it('translates every binding context', () => {
    for (const context of Object.keys(CONTEXT_LABELS)) {
      expect(enLeaves.get(`contexts.${context}`), context).toBeTruthy()
      expect(zhLeaves.get(`contexts.${context}`), context).toBeTruthy()
    }
  })
})
