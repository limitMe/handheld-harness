import path from 'node:path'
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test'
import { forceEnglish } from './i18n'

const root = path.resolve(__dirname, '..', '..')

async function launch(profile: string): Promise<{ app: ElectronApplication; window: Page }> {
  const app = await electron.launch({
    args: [root],
    env: {
      ...process.env,
      HANDHELD_PROFILE: profile,
      HANDHELD_WINDOW: 'windowed',
      HANDHELD_ENGINE_MODE: 'fake',
    },
  })
  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  await window.getByTestId('composer').waitFor()
  await forceEnglish(window)
  return { app, window }
}

async function focusedFocusId(window: Page): Promise<string | null> {
  return window.evaluate(() => {
    const scope = globalThis as unknown as {
      document: {
        querySelector(selector: string): { getAttribute(name: string): string | null } | null
      }
    }
    return scope.document.querySelector('[data-focused]')?.getAttribute('data-focus-id') ?? null
  })
}

test('focuses and activates the composer on start', async () => {
  const { app, window } = await launch('e2e-focus-start')
  try {
    const composer = window.locator('[data-focus-id="composer"]')
    await expect(composer).toHaveAttribute('data-focused', '')
    await expect(composer).toHaveAttribute('data-activated', '')
  } finally {
    await app.close()
  }
})

test('deactivates then navigates to the status bar', async () => {
  const { app, window } = await launch('e2e-focus-nav')
  try {
    // B exits activation; the composer keeps focus but is no longer activated.
    await window.keyboard.press('Escape')
    const composer = window.locator('[data-focus-id="composer"]')
    await expect(composer).toHaveAttribute('data-focused', '')
    await expect(composer).not.toHaveAttribute('data-activated', '')

    // The next up moves focus into the status bar, entering on its first
    // action: the Tasks button.
    await window.keyboard.press('ArrowUp')
    await expect(window.locator('[data-focus-id="open-tasks"]')).toHaveAttribute('data-focused', '')

    // Enter on the Tasks button opens the task map (spec 14).
    await window.keyboard.press('Enter')
    await expect(window.getByTestId('task-map')).toBeVisible()

    // Escape closes it and restores focus.
    await window.keyboard.press('Escape')
    await expect(window.getByTestId('task-map')).toHaveCount(0)
    await expect(window.locator('[data-focus-id="open-tasks"]')).toHaveAttribute('data-focused', '')
  } finally {
    await app.close()
  }
})

test('opens the session info page, picks an effort and closes with Escape', async () => {
  const { app, window } = await launch('e2e-session-info')
  try {
    await window.getByTestId('open-info').click()
    await expect(window.getByTestId('session-info')).toBeVisible()
    await expect(window.getByTestId('session-info-directory')).toBeVisible()
    await expect(window.getByTestId('session-info-metrics')).toBeVisible()

    // The effort row opens a choice dialog (spec 21); the fake model lists
    // default / high / max as variants. Retry until the catalog has loaded.
    const effort = window.getByTestId('session-info-effort')
    await expect(async () => {
      await effort.click()
      await expect(window.getByTestId('choice-high')).toBeVisible({ timeout: 500 })
    }).toPass({ timeout: 10_000 })
    await window.getByTestId('choice-high').click()
    await expect(window.getByTestId('choice-high')).toHaveCount(0)
    await expect(effort).toContainText('high')

    // Escape closes the page instead of falling through to the system menu.
    await window.keyboard.press('Escape')
    await expect(window.getByTestId('session-info')).toHaveCount(0)
    await expect(window.getByTestId('system-menu')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('toggles the focus debug overlay with Ctrl+Shift+F', async () => {
  const { app, window } = await launch('e2e-focus-debug')
  try {
    await window.keyboard.press('Control+Shift+F')
    await expect(window.getByTestId('focus-debug')).toBeVisible()
    await expect(window.getByTestId('focus-debug')).toContainText('composer')
    await window.keyboard.press('Control+Shift+F')
    await expect(window.getByTestId('focus-debug')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('moves focus into the chat transcript', async () => {
  const { app, window } = await launch('e2e-focus-history')
  try {
    const composer = window.getByTestId('composer')
    await composer.fill('hello')
    await composer.press('Enter')
    await expect(window.getByTestId('message-list')).toContainText('DONE', { timeout: 30_000 })

    const scrolled = await window
      .getByTestId('message-list')
      .evaluate((element) => element.hasAttribute('data-scroll-region'))
    expect(scrolled).toBe(true)

    // Sending leaves the composer deactivated (focus stays on the form); step
    // up into the transcript. Agent and choice cards are the focus stops.
    await window.keyboard.press('ArrowUp')
    const first = await focusedFocusId(window)
    expect(first).toMatch(/^(card|choice)-/)

    await window.keyboard.press('ArrowUp')
    const second = await focusedFocusId(window)
    expect(second).not.toBe(first)
  } finally {
    await app.close()
  }
})
