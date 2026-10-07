import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import StatusBar from './components/StatusBar'
import GamepadDebug from './debug/GamepadDebug'
import MicDebug from './debug/MicDebug'
import EngineDebug from './engine/EngineDebug'
import { useEngineStatus } from './engine/useEngineStatus'
import { FocusDebugOverlay } from './focus'
import { CONTEXT_ORDER, onPress, useInputContext } from './input'
import { useWorkbenchStore } from './state/store'
import { sessionKey } from './state/types'
import { showToast } from './ui'
import { CurrentWork } from './workbench/CurrentWork'
import { TaskMap } from './workbench/TaskMap'
import { SystemMenu } from './system/SystemMenu'

export default function App() {
  const [gamepadOpen, setGamepadOpen] = useState(false)
  const [micOpen, setMicOpen] = useState(false)
  const [engineOpen, setEngineOpen] = useState(false)
  const [focusDebugOpen, setFocusDebugOpen] = useState(false)
  const [mapOpen, setMapOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const initialize = useWorkbenchStore((state) => state.initialize)
  const sessions = useWorkbenchStore((state) => state.sessions)
  const current = useWorkbenchStore((state) => state.ui.current)
  const abortCurrent = useWorkbenchStore((state) => state.abortCurrent)

  // Screen context: bindings resolve here; navigation is handled by the focus tree.
  useInputContext(
    'currentWork',
    useMemo(() => ({ 'agent.abort': onPress(() => void abortCurrent()) }), [abortCurrent]),
    CONTEXT_ORDER.screen,
  )

  // Global chrome: Back toggles the task map (spec 14), Start the system menu
  // (spec 15). The two overlays are mutually exclusive.
  useInputContext(
    'global',
    useMemo(
      () => ({
        'map.toggle': onPress(() =>
          setMapOpen((open) => {
            if (!open) setMenuOpen(false)
            return !open
          }),
        ),
        'menu.toggle': onPress(() =>
          setMenuOpen((open) => {
            if (!open) setMapOpen(false)
            return !open
          }),
        ),
      }),
      [],
    ),
    CONTEXT_ORDER.global,
  )

  useEffect(() => {
    void initialize()
  }, [initialize])

  const engineStatus = useEngineStatus()
  const previousEngineState = useRef<string | undefined>(undefined)
  useEffect(() => {
    const state = engineStatus?.state
    const previous = previousEngineState.current
    if (state === 'ready' && (previous === 'reconnecting' || previous === 'down')) {
      showToast('Engine reconnected')
    }
    previousEngineState.current = state
  }, [engineStatus])

  const title = menuOpen
    ? 'System menu'
    : mapOpen
      ? 'Task map'
      : current
        ? (sessions[sessionKey(current)]?.title ?? 'Task')
        : 'New task'

  const adjustZoom = useCallback(async (direction: -1 | 0 | 1): Promise<void> => {
    const settings = await window.handheld.settings.get()
    const factor = direction === 0 ? 1 : settings.ui.zoom + direction * 0.1
    await window.handheld.window.setZoom(Math.round(factor * 100) / 100)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.ctrlKey && event.shiftKey) {
        if (event.code === 'KeyG') {
          event.preventDefault()
          setGamepadOpen((open) => !open)
        } else if (event.code === 'KeyM') {
          event.preventDefault()
          setMicOpen((open) => !open)
        } else if (event.code === 'KeyE') {
          event.preventDefault()
          setEngineOpen((open) => !open)
        } else if (event.code === 'KeyF') {
          event.preventDefault()
          setFocusDebugOpen((open) => !open)
        }
        return
      }
      if (!event.ctrlKey) return
      if (event.code === 'Equal' || event.code === 'NumpadAdd') {
        event.preventDefault()
        void adjustZoom(1)
      } else if (event.code === 'Minus' || event.code === 'NumpadSubtract') {
        event.preventDefault()
        void adjustZoom(-1)
      } else if (event.code === 'Digit0' || event.code === 'Numpad0') {
        event.preventDefault()
        void adjustZoom(0)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [adjustZoom])

  return (
    <div className="flex h-full flex-col bg-surface text-text">
      <StatusBar title={title} onOpenTasks={() => setMapOpen(true)} />
      <div className="relative flex flex-1 overflow-hidden">
        <CurrentWork dimmed={mapOpen || menuOpen} />
        <TaskMap open={mapOpen} onClose={() => setMapOpen(false)} />
        <SystemMenu
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          onOpenDebug={(page) => {
            setMenuOpen(false)
            if (page === 'gamepad') setGamepadOpen(true)
            else if (page === 'mic') setMicOpen(true)
            else setEngineOpen(true)
          }}
        />
      </div>
      <GamepadDebug open={gamepadOpen} onOpenChange={setGamepadOpen} />
      <MicDebug open={micOpen} onOpenChange={setMicOpen} />
      <EngineDebug open={engineOpen} onOpenChange={setEngineOpen} />
      <FocusDebugOverlay open={focusDebugOpen} />
    </div>
  )
}
