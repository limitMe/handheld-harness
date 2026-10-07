import type { Page } from '@playwright/test'

/**
 * Pins the UI language to English before a spec asserts on copy (spec 20). The
 * app otherwise follows the OS locale, which would make text assertions depend
 * on the machine running the tests.
 */
export async function forceEnglish(window: Page): Promise<void> {
  await window.evaluate(() =>
    (
      globalThis as unknown as {
        handheld: { settings: { update(patch: unknown): Promise<unknown> } }
      }
    ).handheld.settings.update({ ui: { language: 'en' } }),
  )
}
