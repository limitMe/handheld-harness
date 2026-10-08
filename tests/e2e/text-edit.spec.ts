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

type PadScope = {
  navigator: object
  __setPad: (name: string, pressed: boolean) => void
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

test('edits the composer text with the gamepad and commits on B', async () => {
  const { app, window } = await launch('e2e-text-edit')
  try {
    await installFakePad(window)
    const composer = window.getByTestId('composer')
    await composer.fill('One. Two.')
    // Put the caret at the start so the editor opens focused on the first sentence.
    await composer.evaluate((element) => {
      const field = element as unknown as { setSelectionRange(start: number, end: number): void }
      field.setSelectionRange(0, 0)
    })

    // RB while the input is activated opens the full-screen editor (spec 17).
    await pressPad(window, 'RB')
    await releasePad(window, 'RB')
    await expect(window.getByTestId('text-edit')).toBeVisible()
    await expect(window.getByTestId('text-edit-sentence')).toHaveCount(2)
    await expect(window.getByTestId('text-edit-sentence').nth(0)).toHaveAttribute(
      'data-focused',
      '',
    )
    // The editor has no title in the status bar (spec 17).
    await expect(window.getByTestId('status-title')).toHaveCount(0)

    // Step right onto the second sentence and delete one character with X.
    await pressPad(window, 'DpadRight')
    await releasePad(window, 'DpadRight')
    await expect(window.getByTestId('text-edit-sentence').nth(1)).toHaveAttribute(
      'data-focused',
      '',
    )
    await pressPad(window, 'X')
    await releasePad(window, 'X')
    // The trailing dot is removed; "One." and "Two" stay two sentences.
    await expect(window.getByTestId('text-edit-sentence')).toHaveCount(2)
    await expect(window.getByTestId('text-edit-sentence').nth(0)).toHaveText('One.')
    await expect(window.getByTestId('text-edit-sentence').nth(1)).toHaveText('Two')

    // B exits and writes the confirmed text back into the composer.
    await pressPad(window, 'B')
    await releasePad(window, 'B')
    await expect(window.getByTestId('text-edit')).toHaveCount(0)
    await expect(composer).toHaveValue('One. Two')
    await expect(window.getByTestId('composer-form')).toHaveAttribute('data-activated', '')
  } finally {
    await app.close()
  }
})
