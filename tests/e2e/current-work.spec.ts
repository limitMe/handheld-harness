import { mkdirSync } from 'node:fs'
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
const artifacts = path.join(root, 'tests', 'e2e', 'artifacts')

const BUTTONS: Record<string, number> = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  Back: 8,
  Start: 9,
  LS: 10,
  RS: 11,
  DpadUp: 12,
  DpadDown: 13,
  DpadLeft: 14,
  DpadRight: 15,
}

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

type PadScope = {
  navigator: object
  __setPad: (name: string, pressed: boolean) => void
}

async function installFakePad(window: Page): Promise<void> {
  await window.evaluate((buttonNames) => {
    const scope = globalThis as unknown as PadScope
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }))
    const pad = {
      id: 'Fake Pad (STANDARD GAMEPAD)',
      index: 0,
      connected: true,
      mapping: 'standard',
      timestamp: 0,
      axes: [0, 0, 0, 0],
      buttons,
    }
    Object.defineProperty(scope.navigator, 'getGamepads', {
      configurable: true,
      value: () => [pad],
    })
    scope.__setPad = (name: string, pressed: boolean) => {
      const index = buttonNames[name]
      if (index === undefined) return
      buttons[index] = { pressed, value: pressed ? 1 : 0 }
    }
  }, BUTTONS)
}

async function pressPad(window: Page, name: string): Promise<void> {
  await window.evaluate((value: string) => {
    ;(globalThis as unknown as PadScope).__setPad(value, true)
  }, name)
  await window.waitForTimeout(150)
}

async function releasePad(window: Page, name: string): Promise<void> {
  await window.evaluate((value: string) => {
    ;(globalThis as unknown as PadScope).__setPad(value, false)
  }, name)
  await window.waitForTimeout(150)
}

async function send(window: Page, text: string): Promise<void> {
  const composer = window.getByTestId('composer')
  await composer.fill(text)
  await composer.press('Enter')
}

test('reactivates the composer after the command list closes', async () => {
  const { app, window } = await launch('e2e-cw-listinput')
  try {
    await installFakePad(window)

    await pressPad(window, 'LB')
    await releasePad(window, 'LB')
    await expect(window.getByTestId('list-input')).toBeVisible()

    // B leaves the list and must hand focus and activation back to the field.
    await pressPad(window, 'B')
    await releasePad(window, 'B')
    await expect(window.getByTestId('list-input')).toHaveCount(0)

    await expect(window.getByTestId('composer-form')).toHaveAttribute('data-activated', '')
    await expect(window.getByTestId('composer')).toBeFocused()
  } finally {
    await app.close()
  }
})

test('collapses the composer when focus leaves and expands it again', async () => {
  const { app, window } = await launch('e2e-cw-collapse')
  try {
    await expect(window.getByTestId('composer')).toBeVisible()

    // B exits activation but the composer keeps focus, so it stays expanded.
    await window.keyboard.press('Escape')
    await expect(window.getByTestId('composer')).toBeVisible()

    // Moving focus up leaves the composer unfocused and empty: the bar returns.
    await window.keyboard.press('ArrowUp')
    await expect(window.getByTestId('composer-collapsed')).toBeVisible()
    await expect(window.getByTestId('composer')).toHaveCount(0)

    // Coming back down expands it without reflowing the transcript.
    await window.keyboard.press('ArrowDown')
    await expect(window.getByTestId('composer')).toBeVisible()
    await expect(window.getByTestId('composer-collapsed')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('deletes one character behind the caret with X', async () => {
  const { app, window } = await launch('e2e-cw-backspace')
  try {
    await installFakePad(window)
    const composer = window.getByTestId('composer')
    await composer.fill('hello')

    await pressPad(window, 'X')
    await releasePad(window, 'X')

    await expect(composer).toHaveValue('hell')
    const caret = await composer.evaluate(
      (element) => (element as unknown as { selectionStart: number }).selectionStart,
    )
    expect(caret).toBe(4)
  } finally {
    await app.close()
  }
})

test('auto-activates the question card and confirms with gamepad A', async () => {
  const { app, window } = await launch('e2e-cw-question')
  try {
    await installFakePad(window)
    await send(window, '/fake question')

    const card = window.getByTestId('question-card')
    await expect(card).toBeVisible({ timeout: 30_000 })
    await expect(card).toHaveAttribute('data-activated', '')

    await pressPad(window, 'A')
    await releasePad(window, 'A')

    await expect(window.getByTestId('question-card')).toHaveCount(0)
    await expect(window.getByTestId('message-list')).toContainText('Answer received: Option A', {
      timeout: 30_000,
    })
  } finally {
    await app.close()
  }
})

test('auto-activates the permission card and shows its action hints', async () => {
  const { app, window } = await launch('e2e-cw-permission')
  try {
    await send(window, '/fake permission')

    const card = window.getByTestId('permission-card')
    await expect(card).toBeVisible({ timeout: 30_000 })
    await expect(card).toHaveAttribute('data-activated', '')

    await expect(window.getByTestId('action-hints')).toBeVisible({ timeout: 5_000 })
    await expect(window.getByTestId('action-hints')).toContainText('Allow once')
  } finally {
    await app.close()
  }
})

test('keeps a short user message expanded at the top', async () => {
  const { app, window } = await launch('e2e-cw-short')
  try {
    await send(window, 'hello')
    await expect(window.getByTestId('message-list')).toContainText('DONE', { timeout: 30_000 })

    await expect(window.locator('[data-testid="sticky-user"][data-collapsed]')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('collapses the sticky user message when scrolled past', async () => {
  const { app, window } = await launch('e2e-cw-sticky')
  try {
    await send(window, '/fake many')
    await expect(window.getByTestId('message-list')).toContainText('Answer 200', {
      timeout: 30_000,
    })

    await window.getByTestId('message-list').evaluate((element) => {
      const rounds = Array.from(element.querySelectorAll('[data-testid^="round-"]')) as unknown as Array<{
        offsetTop: number
      }>
      const middle = rounds[Math.floor(rounds.length / 2)]
      element.scrollTop = middle ? middle.offsetTop + 24 : Math.round(element.scrollHeight / 2)
    })

    const collapsed = window.locator('[data-testid="sticky-user"][data-collapsed]')
    await expect.poll(() => collapsed.count(), { timeout: 5_000 }).toBeGreaterThan(0)
    await expect(collapsed.first()).toBeVisible()

    // The header we scrolled into is pinned just below the container's padding
    // instead of being carried off the top of the visible area.
    const pinned = await window.getByTestId('message-list').evaluate((element) => {
      const rounds = Array.from(element.querySelectorAll('[data-testid^="round-"]')) as unknown as Array<{
        querySelector(selector: string): { getBoundingClientRect(): { top: number } } | null
      }>
      const middle = rounds[Math.floor(rounds.length / 2)]
      const header = middle?.querySelector('[data-testid="sticky-user"]')
      if (!header) return null
      return header.getBoundingClientRect().top - element.getBoundingClientRect().top
    })
    expect(pinned).not.toBeNull()
    expect(pinned as number).toBeGreaterThanOrEqual(0)
    expect(pinned as number).toBeLessThan(32)

    mkdirSync(artifacts, { recursive: true })
    await window.screenshot({ path: path.join(artifacts, 'current-work-sticky.png') })

    mkdirSync(artifacts, { recursive: true })
    await window.screenshot({ path: path.join(artifacts, 'current-work-sticky.png') })
  } finally {
    await app.close()
  }
})
