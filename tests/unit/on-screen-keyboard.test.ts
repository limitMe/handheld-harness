import { describe, expect, it } from 'vitest'
import {
  showOnScreenKeyboard,
  type OnScreenKeyboardDeps,
} from '../../src/main/on-screen-keyboard'

interface Harness {
  deps: OnScreenKeyboardDeps
  launched: string[]
}

function harness(platform: NodeJS.Platform): Harness {
  const launched: string[] = []
  return {
    deps: {
      platform,
      launch: (command) => {
        launched.push(command)
      },
    },
    launched,
  }
}

describe('showOnScreenKeyboard', () => {
  it('launches osk.exe on Windows', () => {
    const { deps, launched } = harness('win32')
    showOnScreenKeyboard(deps)
    expect(launched).toEqual(['osk.exe'])
  })

  it('does nothing off Windows', () => {
    const { deps, launched } = harness('darwin')
    showOnScreenKeyboard(deps)
    expect(launched).toEqual([])
  })
})
