import path from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

const root = path.resolve(__dirname, '..', '..')

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

async function launch(
  profile: string,
): Promise<{ app: ElectronApplication; window: Page }> {
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
  await installFakePad(window)
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
  await window.evaluate(
    (args: { name: string }) => {
      ;(globalThis as unknown as PadScope).__setPad(args.name, true)
    },
    { name },
  )
  await window.waitForTimeout(150)
}

async function releasePad(window: Page, name: string): Promise<void> {
  await window.evaluate(
    (args: { name: string }) => {
      ;(globalThis as unknown as PadScope).__setPad(args.name, false)
    },
    { name },
  )
  await window.waitForTimeout(150)
}

test('picks /compact from list input and sends it with the gamepad', async () => {
  const { app, window } = await launch('e2e-pad-list-input')
  try {
    // LB opens the command picker while the composer is activated.
    await pressPad(window, 'LB')
    await releasePad(window, 'LB')
    await expect(window.getByTestId('list-input')).toBeVisible()

    // Recent-use ordering is persisted, so step until /compact is highlighted.
    for (let i = 0; i < 5; i += 1) {
      const highlighted = window.locator('[data-testid="list-input-compact"][data-highlighted]')
      if ((await highlighted.count()) > 0) break
      await pressPad(window, 'DpadDown')
      await releasePad(window, 'DpadDown')
    }
    await expect(
      window.locator('[data-testid="list-input-compact"][data-highlighted]'),
    ).toHaveCount(1)

    await pressPad(window, 'A')
    await releasePad(window, 'A')

    // Choosing inserts the command into the composer for the user to send.
    await expect(window.getByTestId('composer')).toHaveValue('/compact')

    await pressPad(window, 'A')
    await releasePad(window, 'A')
    await expect(window.getByTestId('message-list')).toContainText('Fake ran /compact', {
      timeout: 30_000,
    })
  } finally {
    await app.close()
  }
})

test('A on the Tasks button opens the switcher and releasing A keeps it open', async () => {
  const { app, window } = await launch('e2e-pad-tasks')
  try {
    // Create a session so the switcher actually has a row (the reported case).
    const composer = window.getByTestId('composer')
    await composer.fill('hello')
    await composer.press('Enter')
    await expect(window.getByTestId('message-list')).toContainText('DONE', { timeout: 30_000 })

    // Walk focus up to the Tasks button (past the composer and transcript parts).
    for (let i = 0; i < 12; i += 1) {
      await pressPad(window, 'DpadUp')
      await releasePad(window, 'DpadUp')
      if ((await window.locator('[data-focus-id="open-tasks"][data-focused]').count()) > 0) break
    }
    await expect(window.locator('[data-focus-id="open-tasks"]')).toHaveAttribute(
      'data-focused',
      '',
    )

    await pressPad(window, 'A')
    await expect(window.getByTestId('task-list')).toBeVisible()

    await releasePad(window, 'A')
    await expect(window.getByTestId('task-list')).toBeVisible()
    // The filter, not a row, takes the initial focus.
    await expect(window.locator('[data-focus-id="task-filter"]')).toHaveAttribute(
      'data-focused',
      '',
    )
  } finally {
    await app.close()
  }
})
