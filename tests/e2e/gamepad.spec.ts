import path from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { forceEnglish } from './i18n'

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
  await forceEnglish(window)
  return { app, window }
}

type PadScope = {
  navigator: object
  __setPad: (name: string, pressed: boolean) => void
  __setAxis: (index: number, value: number) => void
}

type SettingsScope = {
  handheld: {
    settings: {
      get(): Promise<{ input: { contexts: Record<string, Record<string, string | null>> } }>
    }
  }
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
    scope.__setAxis = (index: number, value: number) => {
      pad.axes[index] = value
    }
  }, BUTTONS)
}

async function setAxis(window: Page, index: number, value: number): Promise<void> {
  await window.evaluate(
    (args: { index: number; value: number }) => {
      ;(globalThis as unknown as PadScope).__setAxis(args.index, args.value)
    },
    { index, value },
  )
  await window.waitForTimeout(150)
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

test('rebinds Send from A to Y in the system menu', async () => {
  const { app, window } = await launch('e2e-pad-system-menu')
  try {
    const composer = window.getByTestId('composer')
    await composer.fill('hello')
    await composer.press('Enter')
    await expect(window.getByTestId('message-list')).toContainText('DONE', { timeout: 30_000 })

    // Start opens the system menu; the first category is focused.
    await pressPad(window, 'Start')
    await releasePad(window, 'Start')
    await expect(window.getByTestId('system-menu')).toBeVisible()
    await expect(window.getByTestId('menu-category-keys')).toHaveAttribute('data-focused', '')

    // A enters the settings column, focusing the gamepad tab.
    await pressPad(window, 'A')
    await releasePad(window, 'A')
    await expect(window.getByTestId('keys-device-gamepad')).toHaveAttribute('data-focused', '')

    // Walk down to the "Send" binding row.
    for (let i = 0; i < 24; i += 1) {
      if (
        (await window
          .locator('[data-testid="binding-currentWork.input-input.send"][data-focused]')
          .count()) > 0
      ) {
        break
      }
      await pressPad(window, 'DpadDown')
      await releasePad(window, 'DpadDown')
    }
    await expect(
      window.locator('[data-testid="binding-currentWork.input-input.send"]'),
    ).toHaveAttribute('data-focused', '')

    // A starts capture; Y becomes the new key (X is taken by delete-backspace).
    await pressPad(window, 'A')
    await releasePad(window, 'A')
    await expect(window.getByTestId('capture-banner')).toBeVisible()
    await pressPad(window, 'Y')
    await releasePad(window, 'Y')
    await expect(window.getByTestId('capture-banner')).toHaveCount(0)
    await expect(window.getByTestId('binding-key-currentWork.input-input.send')).toHaveText('Y')

    // The override is persisted to settings (spec 15 acceptance).
    const override = await window.evaluate(() =>
      (globalThis as unknown as SettingsScope).handheld.settings.get(),
    )
    expect(override.input.contexts['currentWork.input']?.Y).toBe('input.send')
    expect(override.input.contexts['currentWork.input']?.A).toBeNull()

    // Restore the default so the profile stays clean for later runs. The reset
    // row is the last one on the page.
    for (let i = 0; i < 40; i += 1) {
      if (
        (await window
          .locator('[data-testid="binding-reset-all"][data-focused]')
          .count()) > 0
      ) {
        break
      }
      await pressPad(window, 'DpadDown')
      await releasePad(window, 'DpadDown')
    }
    await pressPad(window, 'A')
    await releasePad(window, 'A')
    await pressPad(window, 'A')
    await releasePad(window, 'A')
    const restored = await window.evaluate(() =>
      (globalThis as unknown as SettingsScope).handheld.settings.get(),
    )
    expect(restored.input.contexts['currentWork.input']).toBeUndefined()
  } finally {
    await app.close()
  }
})

test('switches the theme between dark and light from the system menu', async () => {
  const { app, window } = await launch('e2e-pad-theme')
  try {
    // The profile persists between runs, so start from a known mode.
    await window.evaluate(() =>
      (
        globalThis as unknown as {
          handheld: { settings: { update(patch: unknown): Promise<unknown> } }
        }
      ).handheld.settings.update({ ui: { theme: 'system' } }),
    )

    // Start opens the menu with the first category focused.
    await pressPad(window, 'Start')
    await releasePad(window, 'Start')
    await expect(window.getByTestId('system-menu')).toBeVisible()

    // Walk down to "Display & hints" (keys -> models -> voice -> display).
    for (let i = 0; i < 3; i += 1) {
      if (
        (await window.locator('[data-testid="menu-category-display"][data-focused]').count()) > 0
      ) {
        break
      }
      await pressPad(window, 'DpadDown')
      await releasePad(window, 'DpadDown')
    }
    await expect(window.getByTestId('menu-category-display')).toHaveAttribute('data-focused', '')

    // A enters the panel (Text size), then down to the Theme row.
    await pressPad(window, 'A')
    await releasePad(window, 'A')
    await pressPad(window, 'DpadDown')
    await releasePad(window, 'DpadDown')
    await expect(window.getByTestId('display-theme')).toHaveAttribute('data-focused', '')

    // A opens the picker with the first option (Follow system) focused.
    await pressPad(window, 'A')
    await releasePad(window, 'A')
    await expect(window.getByTestId('choice-system')).toBeVisible()

    // Step down to Dark and confirm.
    await pressPad(window, 'DpadDown')
    await releasePad(window, 'DpadDown')
    await pressPad(window, 'A')
    await releasePad(window, 'A')
    await expect(window.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(window.getByTestId('display-theme')).toHaveAttribute('data-focused', '')

    // Reopen and pick Light.
    await pressPad(window, 'A')
    await releasePad(window, 'A')
    await expect(window.getByTestId('choice-system')).toBeVisible()
    await pressPad(window, 'DpadDown')
    await releasePad(window, 'DpadDown')
    await pressPad(window, 'DpadDown')
    await releasePad(window, 'DpadDown')
    await pressPad(window, 'A')
    await releasePad(window, 'A')
    await expect(window.locator('html')).toHaveAttribute('data-theme', 'light')

    // The selection is persisted (spec 15: settings save immediately).
    const settings = await window.evaluate(() =>
      (
        globalThis as unknown as {
          handheld: { settings: { get(): Promise<{ ui: { theme: string } }> } }
        }
      ).handheld.settings.get(),
    )
    expect(settings.ui.theme).toBe('light')
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

    // Y adds an empty card at the right and selects it. It is focused but never
    // auto-activated: activation is a separate concept (spec 11/14).
    await pressPad(window, 'Y')
    await releasePad(window, 'Y')
    await expect(window.getByTestId('task-card-empty')).toHaveAttribute('data-selected', '')
    await expect(window.getByTestId('task-card-empty')).toHaveAttribute('data-focused', '')
    await expect(window.getByTestId('task-card-empty')).not.toHaveAttribute('data-activated', '')
    // The map's bottom legend is unchanged; the new hints live inside the card.
    await expect(window.getByTestId('task-card-empty')).toContainText('Open a recent task')
    await window.screenshot({
      path: path.join(root, 'tests', 'e2e', 'artifacts', 'task-map-empty-card.png'),
    })

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

test('picks a model from the recent-model ring on the empty task card', async () => {
  const { app, window } = await launch('e2e-pad-model-ring')
  try {
    // The profile persists between runs, so start from a clean model state.
    await window.evaluate(() =>
      (
        globalThis as unknown as {
          handheld: { settings: { update(patch: unknown): Promise<unknown> } }
        }
      ).handheld.settings.update({ model: { default: null, recent: [] } }),
    )

    // Choosing a model in System menu › Models also fills the recent ring.
    await pressPad(window, 'Start')
    await releasePad(window, 'Start')
    await expect(window.getByTestId('system-menu')).toBeVisible()
    await pressPad(window, 'DpadDown')
    await releasePad(window, 'DpadDown')
    await expect(window.getByTestId('menu-category-models')).toHaveAttribute('data-focused', '')
    await pressPad(window, 'A')
    await releasePad(window, 'A')
    await expect(window.getByTestId('models-search')).toHaveAttribute('data-focused', '')
    await pressPad(window, 'DpadDown')
    await releasePad(window, 'DpadDown')
    await expect(window.getByTestId('models-refresh')).toHaveAttribute('data-focused', '')
    await pressPad(window, 'DpadDown')
    await releasePad(window, 'DpadDown')
    await expect(window.getByTestId('model-engine-default')).toHaveAttribute('data-focused', '')
    await pressPad(window, 'DpadDown')
    await releasePad(window, 'DpadDown')
    await expect(window.getByTestId('model-provider-fake')).toHaveAttribute('data-focused', '')
    await pressPad(window, 'A')
    await releasePad(window, 'A')
    await expect(window.getByTestId('model-fake-fake-model')).not.toBeNull()
    await pressPad(window, 'DpadDown')
    await releasePad(window, 'DpadDown')
    await pressPad(window, 'A')
    await releasePad(window, 'A')

    const chosen = await window.evaluate(() =>
      (
        globalThis as unknown as {
          handheld: { settings: { get(): Promise<{ model: { default: unknown; recent: unknown[] } }> } }
        }
      ).handheld.settings.get(),
    )
    expect(chosen.model.default).toEqual({ providerId: 'fake', modelId: 'fake-model' })
    expect(chosen.model.recent).toEqual([
      { model: { providerId: 'fake', modelId: 'fake-model' }, slot: 0, name: 'Fake model' },
    ])

    // Close the menu, open the map and add the empty card.
    await pressPad(window, 'Start')
    await releasePad(window, 'Start')
    await expect(window.getByTestId('system-menu')).toHaveCount(0)
    await pressPad(window, 'Back')
    await releasePad(window, 'Back')
    await expect(window.getByTestId('task-map')).toBeVisible()
    await pressPad(window, 'Y')
    await releasePad(window, 'Y')
    await expect(window.getByTestId('task-card-empty')).toBeVisible()

    // Long-press LB opens the ring; the current default is the highlighted sector.
    await pressPad(window, 'LB')
    await window.waitForTimeout(500)
    await expect(window.getByTestId('model-ring')).toBeVisible()
    await expect(window.getByTestId('model-ring-slot-0')).toHaveAttribute(
      'data-model',
      'fake/fake-model',
    )
    await expect(window.getByTestId('model-ring-slot-0')).toHaveAttribute('data-selected', '')
    await window.screenshot({ path: path.join(root, 'tests', 'e2e', 'artifacts', 'model-ring.png') })

    // Pointing at an empty sector still highlights it (grey) but has no model.
    await setAxis(window, 1, 1)
    await expect(window.getByTestId('model-ring-slot-3')).toHaveAttribute('data-selected', '')
    await expect(window.getByTestId('model-ring-slot-3')).not.toHaveAttribute('data-occupied', '')

    // Back to the model, then release to adopt it.
    await setAxis(window, 1, -1)
    await expect(window.getByTestId('model-ring-slot-0')).toHaveAttribute('data-selected', '')
    await releasePad(window, 'LB')
    await expect(window.getByTestId('model-ring')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('rotates the model ring with the stick and keeps the pick when the stick is released', async () => {
  const { app, window } = await launch('e2e-pad-model-rotate')
  try {
    const recent = [
      { model: { providerId: 'fake', modelId: 'm0' }, slot: 0, name: 'Model 0' },
      { model: { providerId: 'fake', modelId: 'm1' }, slot: 1, name: 'Model 1' },
      { model: { providerId: 'fake', modelId: 'm2' }, slot: 2, name: 'Model 2' },
      { model: { providerId: 'fake', modelId: 'm3' }, slot: 3, name: 'Model 3' },
      { model: { providerId: 'fake', modelId: 'm4' }, slot: 4, name: 'Model 4' },
      { model: { providerId: 'fake', modelId: 'm5' }, slot: 5, name: 'Model 5' },
    ]
    await window.evaluate(
      (models) =>
        (
          globalThis as unknown as {
            handheld: { settings: { update(patch: unknown): Promise<unknown> } }
          }
        ).handheld.settings.update({ model: { default: models.m3, recent: models.recent } }),
      { m3: recent[3]!.model, recent },
    )

    // Open the map, add the empty card and long-press LB.
    await pressPad(window, 'Back')
    await releasePad(window, 'Back')
    await expect(window.getByTestId('task-map')).toBeVisible()
    await pressPad(window, 'Y')
    await releasePad(window, 'Y')
    await pressPad(window, 'LB')
    await window.waitForTimeout(500)
    await expect(window.getByTestId('model-ring')).toBeVisible()

    // The ring opens on the current default (slot 3, the bottom sector).
    await expect(window.getByTestId('model-ring-slot-3')).toHaveAttribute('data-selected', '')

    // Point the right stick up-right: the angle selects the upper-right sector.
    await setAxis(window, 2, 0.7)
    await setAxis(window, 3, -0.7)
    await expect(window.getByTestId('model-ring-slot-1')).toHaveAttribute('data-selected', '')
    await window.screenshot({
      path: path.join(root, 'tests', 'e2e', 'artifacts', 'model-ring-full.png'),
    })

    // Releasing the stick reports the two axes a frame apart; the cursor must not
    // snap to a cardinal sector (which made it always land on the top one).
    await setAxis(window, 2, 0)
    await expect(window.getByTestId('model-ring-slot-1')).toHaveAttribute('data-selected', '')
    await setAxis(window, 3, 0)
    await expect(window.getByTestId('model-ring-slot-1')).toHaveAttribute('data-selected', '')

    // Releasing LB adopts the picked sector.
    await releasePad(window, 'LB')
    await expect(window.getByTestId('model-ring')).toHaveCount(0)
    const after = await window.evaluate(() =>
      (
        globalThis as unknown as {
          handheld: { settings: { get(): Promise<{ model: { default: { modelId: string } } }> } }
        }
      ).handheld.settings.get(),
    )
    expect(after.model.default).toEqual({ providerId: 'fake', modelId: 'm1' })
  } finally {
    await app.close()
  }
})
