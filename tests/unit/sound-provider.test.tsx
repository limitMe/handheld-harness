// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { DEFAULT_SETTINGS } from '../../src/shared/ipc'
import { InputProvider, onPress, useInputContext } from '../../src/renderer/src/input'
import { SoundProvider, soundPlayer } from '../../src/renderer/src/sound'
import { useWorkbenchStore } from '../../src/renderer/src/state/store'

function Bridge({ handle }: { handle: boolean }): null {
  useInputContext(
    'systemMenu',
    handle
      ? { 'nav.down': onPress(() => undefined), 'nav.activate': onPress(() => undefined) }
      : {},
  )
  return null
}

function installBridge(enabled: boolean, completionEnabled = true): void {
  const settings = structuredClone(DEFAULT_SETTINGS)
  settings.sound.enabled = enabled
  settings.sound.completionEnabled = completionEnabled
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
  soundPlayer.completionEnabled = false
  useWorkbenchStore.setState({ sessions: {} })
  vi.restoreAllMocks()
})

function setRunState(runState: 'busy' | 'idle'): void {
  useWorkbenchStore.setState({
    sessions: {
      'fake:ses_1': {
        id: 'ses_1',
        title: 'Task',
        createdAt: 0,
        updatedAt: 0,
        runState,
      },
    },
  })
}

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

  it('plays the completion cue when a run goes busy -> idle', async () => {
    installBridge(false)
    const play = vi.spyOn(soundPlayer, 'playCompletion').mockImplementation(() => undefined)
    renderSound(false)

    await waitFor(() => expect(soundPlayer.completionEnabled).toBe(true))

    setRunState('busy')
    expect(play).not.toHaveBeenCalled()
    setRunState('idle')
    expect(play).toHaveBeenCalledTimes(1)
  })

  it('stays silent on completion while the setting is off', async () => {
    installBridge(false, false)
    const play = vi.spyOn(soundPlayer, 'playCompletion').mockImplementation(() => undefined)
    // Start enabled so waiting for the applied setting proves the change landed.
    soundPlayer.completionEnabled = true
    renderSound(false)

    await waitFor(() => expect(soundPlayer.completionEnabled).toBe(false))

    setRunState('busy')
    setRunState('idle')
    expect(play).not.toHaveBeenCalled()
  })
})
