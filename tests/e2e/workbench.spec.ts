import path from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

const root = path.resolve(__dirname, '..', '..')

async function launch(
  profile: string,
  extraEnv: Record<string, string> = {},
): Promise<{ app: ElectronApplication; window: Page }> {
  const app = await electron.launch({
    args: [root],
    env: {
      ...process.env,
      HANDHELD_PROFILE: profile,
      HANDHELD_WINDOW: 'windowed',
      HANDHELD_ENGINE_MODE: 'fake',
      ...extraEnv,
    },
  })
  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  await window.getByTestId('composer').waitFor()
  return { app, window }
}

async function send(window: Page, text: string): Promise<void> {
  const composer = window.getByTestId('composer')
  await composer.fill(text)
  await composer.press('Enter')
}

test('sends a message and sees the replayed reply', async () => {
  const { app, window } = await launch('e2e-wb-send')
  try {
    await send(window, 'hello')
    await expect(window.getByTestId('message-assistant').last()).toBeVisible({ timeout: 30_000 })
    await expect(window.getByTestId('message-list')).toContainText('DONE', { timeout: 30_000 })
  } finally {
    await app.close()
  }
})

test('handles a permission request and dismisses the card', async () => {
  const { app, window } = await launch('e2e-wb-permission')
  try {
    await send(window, '/fake permission')
    await expect(window.getByTestId('permission-card')).toBeVisible({ timeout: 30_000 })
    await window.getByTestId('permission-once').click()
    await expect(window.getByTestId('permission-card')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('keeps task content when switching between tasks', async () => {
  const { app, window } = await launch('e2e-wb-switch')
  try {
    await send(window, 'hello')
    await expect(window.getByTestId('message-list')).toContainText('DONE', { timeout: 30_000 })

    // Open the task map from the status bar, add a card (N) and open it (Enter).
    await window.getByTestId('open-tasks').click()
    await expect(window.getByTestId('task-map')).toBeVisible()
    await window.keyboard.press('n')
    await expect(window.getByTestId('task-card-empty')).toHaveAttribute('data-selected', '')
    await window.keyboard.press('Enter')
    await expect(window.getByTestId('status-title')).toHaveText('New task')

    await send(window, 'second')
    await expect(window.getByTestId('status-title')).toHaveText('Fake session 2')

    // Reopen the map, step left to the first task and switch to it.
    await window.getByTestId('open-tasks').click()
    await window.keyboard.press('ArrowLeft')
    await window.keyboard.press('Enter')

    await expect(window.getByTestId('status-title')).toHaveText('Fake session 1')
    await expect(window.getByTestId('message-list')).toContainText('hello')
  } finally {
    await app.close()
  }
})

test('restores the current task after a reload', async () => {
  const { app, window } = await launch('e2e-wb-reload')
  try {
    await send(window, 'hello')
    await expect(window.getByTestId('message-list')).toContainText('DONE', { timeout: 30_000 })

    await window.keyboard.press('Control+r')
    await window.waitForLoadState('domcontentloaded')

    await expect(window.getByTestId('status-title')).toHaveText('Fake session 1', {
      timeout: 30_000,
    })
    await expect(window.getByTestId('message-list')).toContainText('hello', { timeout: 30_000 })
  } finally {
    await app.close()
  }
})

test('hides the always-allow button when the capability is off', async () => {
  const { app, window } = await launch('e2e-wb-cap', {
    HANDHELD_FAKE_CAPABILITIES: 'permissionAlways=false',
  })
  try {
    await send(window, '/fake permission')
    await expect(window.getByTestId('permission-card')).toBeVisible({ timeout: 30_000 })
    await expect(window.getByTestId('permission-always')).toHaveCount(0)
    await expect(window.getByTestId('permission-once')).toBeVisible()
  } finally {
    await app.close()
  }
})
