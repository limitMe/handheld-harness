// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { DEFAULT_SETTINGS } from '../../src/shared/ipc'
import { InputProvider, onPress, useInputContext } from '../../src/renderer/src/input'
import { SoundProvider, soundPlayer } from '../../src/renderer/src/sound'

function Bridge({ handle }: { handle: boolean }): null {
  useInputContext(
    'systemMenu',
    handle
      ? { 'nav.down': onPress(() => undefined), 'nav.activate': onPress(() => undefined) }
      : {},
  )
  return null
}

function installBridge(enabled: boolean): void {
  const settings = structuredClone(DEFAULT_SETTINGS)
  settings.sound.enabled = enabled
  ;(window as unknown as { handheld: unknown }).handheld = {
    settings: {
      get: vi.fn(async () => settings),
      update: vi.fn(async () => settings),
    },
    events: { on: vi.fn(() => () => undefined) },
  }
}

function renderSound(handle: boolean): void {
  render(
    <InputProvider>
      <SoundProvider>
        <Bridge handle={handle} />
      </SoundProvider>
    </InputProvider>,
  )
}

afterEach(() => {
  cleanup()
  delete (window as unknown as { handheld?: unknown }).handheld
  soundPlayer.enabled = false
  vi.restoreAllMocks()
})

describe('SoundProvider', () => {
  it('plays the mapped cue for handled short presses when enabled', async () => {
    installBridge(true)
    const play = vi.spyOn(soundPlayer, 'play').mockImplementation(() => undefined)
    renderSound(true)

    await waitFor(() => expect(soundPlayer.enabled).toBe(true))

    fireEvent.keyDown(window, { key: 'ArrowDown' })
    await waitFor(() => expect(play).toHaveBeenCalledWith('scroll'))

    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(play).toHaveBeenCalledWith('select'))
  })

  it('stays silent while the setting is off', async () => {
    installBridge(false)
    const play = vi.spyOn(soundPlayer, 'play').mockImplementation(() => undefined)
    renderSound(true)

    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(play).not.toHaveBeenCalled()
  })

  it('ignores actions no context handles', async () => {
    installBridge(true)
    const play = vi.spyOn(soundPlayer, 'play').mockImplementation(() => undefined)
    renderSound(false)

    await waitFor(() => expect(soundPlayer.enabled).toBe(true))

    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(play).not.toHaveBeenCalled()
  })
})
