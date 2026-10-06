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

test('A on the Tasks button opens the task map and releasing A keeps it open', async () => {
  const { app, window } = await launch('e2e-pad-tasks')
  try {
    // Create a session so the map actually has a card (the reported case).
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
    await expect(window.getByTestId('task-map')).toBeVisible()

    await releasePad(window, 'A')
    await expect(window.getByTestId('task-map')).toBeVisible()
    // The current task's card is selected, focused and activated for hints.
    const card = window.getByTestId('task-card').first()
    await expect(card).toHaveAttribute('data-focused', '')
    await expect(card).toHaveAttribute('data-activated', '')
  } finally {
    await app.close()
  }
})

test('creates, switches, closes and reopens tasks from the map', async () => {
  const { app, window } = await launch('e2e-pad-task-map')
  try {
    const composer = window.getByTestId('composer')
    await composer.fill('hello')
    await composer.press('Enter')
    await expect(window.getByTestId('message-list')).toContainText('DONE', { timeout: 30_000 })

    // Back opens the map with the current task selected.
    await pressPad(window, 'Back')
    await releasePad(window, 'Back')
    await expect(window.getByTestId('task-map')).toBeVisible()
    await expect(window.getByTestId('task-card').first()).toHaveAttribute('data-selected', '')

    // Y adds an empty card at the right and selects it.
    await pressPad(window, 'Y')
    await releasePad(window, 'Y')
    await expect(window.getByTestId('task-card-empty')).toHaveAttribute('data-selected', '')

    // A creates a new task and returns to the chat.
    await pressPad(window, 'A')
    await releasePad(window, 'A')
    await expect(window.getByTestId('task-map')).toHaveCount(0)
    await expect(window.getByTestId('status-title')).toHaveText('New task')

    await composer.fill('second')
    await composer.press('Enter')
    await expect(window.getByTestId('status-title')).toHaveText('Fake session 2', {
      timeout: 30_000,
    })

    // Open the map and step left to task 1, then open it.
    await pressPad(window, 'Back')
    await releasePad(window, 'Back')
    await pressPad(window, 'DpadLeft')
    await releasePad(window, 'DpadLeft')
    await expect(window.getByTestId('task-card').first()).toHaveAttribute('data-selected', '')
    await pressPad(window, 'A')
    await releasePad(window, 'A')
    await expect(window.getByTestId('status-title')).toHaveText('Fake session 1')
    await expect(window.getByTestId('message-list')).toContainText('hello')

    // Long-press B closes task 1; the dialog starts on Close, so A confirms.
    await pressPad(window, 'Back')
    await releasePad(window, 'Back')
    await pressPad(window, 'B')
    await window.waitForTimeout(500)
    await expect(window.getByRole('alertdialog')).toBeVisible()
    await releasePad(window, 'B')
    await pressPad(window, 'A')
    await releasePad(window, 'A')
    await expect(window.getByRole('alertdialog')).toHaveCount(0)

    // Closing the current card switched to the neighbour (task 2). The map stays
    // open, so exit it before the status bar shows the new title.
    await pressPad(window, 'B')
    await releasePad(window, 'B')
    await expect(window.getByTestId('task-map')).toHaveCount(0)
    await expect(window.getByTestId('status-title')).toHaveText('Fake session 2')

    // Reopen task 1 from history: Y adds a card, X lists history.
    await pressPad(window, 'Back')
    await releasePad(window, 'Back')
    await pressPad(window, 'Y')
    await releasePad(window, 'Y')
    await pressPad(window, 'X')
    await releasePad(window, 'X')
    await expect(window.getByTestId('task-history')).toBeVisible()
    await pressPad(window, 'A')
    await releasePad(window, 'A')
    await expect(window.getByTestId('task-history')).toHaveCount(0)
    await expect(window.getByTestId('status-title')).toHaveText('Fake session 1')
    await expect(window.getByTestId('message-list')).toContainText('hello')
  } finally {
    await app.close()
  }
})
