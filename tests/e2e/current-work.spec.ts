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
  __setAxis: (index: number, value: number) => void
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
  await window.evaluate((args) => {
    ;(globalThis as unknown as PadScope).__setAxis(args.index, args.value)
  }, { index, value })
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
    // Park the pointer away from the card: a physical cursor resting over an
    // option would otherwise set the D-pad highlight before the gamepad press.
    await window.mouse.move(4, 4)
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

test('surfaces a failed run and clears the error on the next message', async () => {
  const { app, window } = await launch('e2e-cw-error')
  try {
    await send(window, '/fake error')

    const card = window.getByTestId('session-error')
    await expect(card).toBeVisible({ timeout: 30_000 })
    await expect(card).toContainText('Fake engine error: this session failed on purpose.')

    // A fresh run supersedes the failure, so the stale card disappears.
    await send(window, '/fake long')
    await expect(card).toHaveCount(0)
    await expect(window.getByTestId('message-list')).toContainText('End of the long reply.', {
      timeout: 30_000,
    })
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

test('opens an agent card full screen, scrolls it, and returns with B', async () => {
  const { app, window } = await launch('e2e-cw-viewer')
  try {
    await installFakePad(window)
    await window.mouse.move(4, 4)
    // Two long rounds make the transcript scrollable well past the last card,
    // so restoring the exact scroll position is observable.
    await send(window, '/fake long')
    await expect(window.getByTestId('agent-card')).toHaveCount(1, { timeout: 30_000 })
    await expect(window.getByTestId('busy-indicator')).toHaveCount(0, { timeout: 30_000 })
    await send(window, '/fake long')
    await expect(window.getByTestId('agent-card')).toHaveCount(2, { timeout: 30_000 })
    await expect(window.getByTestId('busy-indicator')).toHaveCount(0, { timeout: 30_000 })

    // Move focus from the composer up onto the summary card, then open it.
    const card = window.getByTestId('agent-card').last()
    // The composer starts activated: the first D-pad up exits it, the next walks
    // focus up onto the summary card.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const focused = await window.evaluate(() => {
        const scope = globalThis as unknown as {
          document: {
            querySelector(selector: string): { getAttribute(name: string): string | null } | null
          }
        }
        return scope.document.querySelector('[data-focus-id][data-focused]')?.getAttribute('data-focus-id') ?? ''
      })
      if (focused.startsWith('card-agent')) break
      await pressPad(window, 'DpadUp')
      await releasePad(window, 'DpadUp')
    }
    await expect(card).toHaveAttribute('data-focused', '')

    // Entering full screen remembers the transcript position to restore later.
    const list = window.getByTestId('message-list')
    await list.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await window.waitForTimeout(150)
    const before = await list.evaluate((element) => element.scrollTop)
    expect(before).toBeGreaterThan(0)

    await pressPad(window, 'A')
    await releasePad(window, 'A')

    const viewer = window.getByTestId('card-viewer')
    await expect(viewer).toBeVisible()
    expect(await viewer.evaluate((element) => element.scrollTop)).toBe(0)

    // The D-pad scrolls the full-screen reader (spec 13).
    await window.keyboard.press('ArrowDown')
    expect(await viewer.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)

    // Either stick scrolls it too.
    const beforeStick = await viewer.evaluate((element) => element.scrollTop)
    await setAxis(window, 3, 0.9)
    await window.waitForTimeout(500)
    await setAxis(window, 3, 0)
    await window.waitForTimeout(100)
    expect(await viewer.evaluate((element) => element.scrollTop)).toBeGreaterThan(beforeStick)

    await pressPad(window, 'B')
    await releasePad(window, 'B')
    await expect(window.getByTestId('card-viewer')).toHaveCount(0)
    await window.waitForTimeout(150)
    expect(await list.evaluate((element) => element.scrollTop)).toBe(before)
  } finally {
    await app.close()
  }
})

test('reopens a task scrolled to its newest content', async () => {
  const { app, window } = await launch('e2e-cw-reopen')
  try {
    await installFakePad(window)
    await window.mouse.move(4, 4)
    await send(window, '/fake many')
    await expect(window.getByTestId('message-list')).toContainText('Answer 200', {
      timeout: 30_000,
    })

    // Leave the task scrolled to the very top.
    const list = window.getByTestId('message-list')
    await list.evaluate((element) => {
      element.scrollTop = 0
    })
    await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBe(0)

    // Create and switch to a second task.
    await pressPad(window, 'Back')
    await releasePad(window, 'Back')
    await expect(window.getByTestId('task-map')).toBeVisible()
    await pressPad(window, 'Y')
    await releasePad(window, 'Y')
    await pressPad(window, 'Y')
    await releasePad(window, 'Y')
    await expect(window.getByTestId('task-map')).toHaveCount(0)

    // Step back to the first task and open it again.
    await pressPad(window, 'Back')
    await releasePad(window, 'Back')
    await pressPad(window, 'DpadLeft')
    await releasePad(window, 'DpadLeft')
    await pressPad(window, 'A')
    await releasePad(window, 'A')
    await expect(window.getByTestId('message-list')).toContainText('Answer 200', {
      timeout: 30_000,
    })

    await window.waitForTimeout(300)
    const distanceFromBottom = await list.evaluate(
      (element) => element.scrollHeight - element.scrollTop - element.clientHeight,
    )
    expect(distanceFromBottom).toBeLessThanOrEqual(48)

    // Reopening the *current* task also lands on the newest content.
    await list.evaluate((element) => {
      element.scrollTop = 0
    })
    await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBe(0)
    await pressPad(window, 'Back')
    await releasePad(window, 'Back')
    await expect(window.getByTestId('task-map')).toBeVisible()
    await pressPad(window, 'A')
    await releasePad(window, 'A')
    await window.waitForTimeout(300)
    const reopenedDistance = await list.evaluate(
      (element) => element.scrollHeight - element.scrollTop - element.clientHeight,
    )
    expect(reopenedDistance).toBeLessThanOrEqual(48)
  } finally {
    await app.close()
  }
})

test('anchors the transcript and its cards after a restart', async () => {
  const { app, window } = await launch('e2e-cw-restart')
  try {
    const composer = window.getByTestId('composer')
    await composer.fill('/fake long')
    await composer.press('Enter')
    await expect(window.getByTestId('message-list')).toContainText('End of the long reply.', {
      timeout: 30_000,
    })
    await window.waitForTimeout(500)

    // Restart the renderer: the transcript is loaded asynchronously and the
    // Markdown renders after the first paint.
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.reload()
    })
    await window.waitForLoadState('domcontentloaded')
    await expect(window.getByTestId('message-list')).toContainText('End of the long reply.', {
      timeout: 30_000,
    })
    await window.waitForTimeout(1000)

    const distances = await window.evaluate(() => {
      const scope = globalThis as unknown as {
        document: {
          querySelector(selector: string): {
            scrollHeight: number
            scrollTop: number
            clientHeight: number
          } | null
          querySelectorAll(selector: string): ArrayLike<{
            scrollHeight: number
            scrollTop: number
            clientHeight: number
          }>
        }
      }
      const list = scope.document.querySelector('[data-testid="message-list"]')
      const cards = Array.from(
        scope.document.querySelectorAll('[data-testid="agent-card-content"]'),
      )
      const distance = (element: {
        scrollHeight: number
        scrollTop: number
        clientHeight: number
      }): number => element.scrollHeight - element.scrollTop - element.clientHeight
      return {
        page: list ? distance(list) : Number.POSITIVE_INFINITY,
        cards: cards.map(distance),
      }
    })
    expect(distances.page).toBeLessThanOrEqual(48)
    expect(distances.cards.length).toBeGreaterThan(0)
    for (const card of distances.cards) expect(card).toBeLessThanOrEqual(48)
  } finally {
    await app.close()
  }
})
