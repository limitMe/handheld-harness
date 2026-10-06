import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

const root = path.resolve(__dirname, '..', '..')
const artifacts = path.join(root, 'tests', 'e2e', 'artifacts')

test('smoke: starts the built app and renders the status bar', async () => {
  const app = await electron.launch({
    args: [root],
    env: {
      ...process.env,
      HANDHELD_PROFILE: 'e2e',
      HANDHELD_WINDOW: 'windowed',
    },
  })

  try {
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await expect(window.getByTestId('status-title')).toHaveText('HANDHELD.AI')
    await expect(window.getByTestId('status-time')).toHaveText(/^\d{2}:\d{2}$/)

    const security = await window.evaluate(() => {
      const scope = globalThis as unknown as { require?: unknown; handheld?: unknown }
      return {
        requireType: typeof scope.require,
        hasHandheld: typeof scope.handheld === 'object' && scope.handheld !== null,
      }
    })
    expect(security.requireType).toBe('undefined')
    expect(security.hasHandheld).toBe(true)

    const info = await window.evaluate(() => {
      const scope = globalThis as unknown as {
        handheld: { app: { getInfo(): Promise<{ profile: string }> } }
      }
      return scope.handheld.app.getInfo()
    })
    expect(info.profile).toBe('e2e')

    mkdirSync(artifacts, { recursive: true })
    await window.screenshot({ path: path.join(artifacts, 'smoke.png') })
  } finally {
    await app.close()
  }
})
