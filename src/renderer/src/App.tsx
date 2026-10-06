import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import StatusBar from './components/StatusBar'
import GamepadDebug from './debug/GamepadDebug'
import MicDebug from './debug/MicDebug'
import EngineDebug from './engine/EngineDebug'
import { useEngineStatus } from './engine/useEngineStatus'
import { FocusDebugOverlay } from './focus'
import { CONTEXT_ORDER, onPress, useInputContext } from './input'
import { useWorkbenchStore } from './state/store'
import { keyParts } from './state/types'
import { ConfirmDialog, showToast } from './ui'
import { CurrentWork } from './workbench/CurrentWork'
import { TaskSwitcher, type TaskSwitcherEntry } from './workbench/TaskSwitcher'

export default function App() {
  const [gamepadOpen, setGamepadOpen] = useState(false)
  const [micOpen, setMicOpen] = useState(false)
  const [engineOpen, setEngineOpen] = useState(false)
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [focusDebugOpen, setFocusDebugOpen] = useState(false)

  const initialize = useWorkbenchStore((state) => state.initialize)
  const sessions = useWorkbenchStore((state) => state.sessions)
  const pendingPermissions = useWorkbenchStore((state) => state.pendingPermissions)
  const pendingQuestions = useWorkbenchStore((state) => state.pendingQuestions)
  const current = useWorkbenchStore((state) => state.ui.current)
  const openSession = useWorkbenchStore((state) => state.openSession)
  const newTask = useWorkbenchStore((state) => state.newTask)
  const deleteCurrentSession = useWorkbenchStore((state) => state.deleteCurrentSession)
  const abortCurrent = useWorkbenchStore((state) => state.abortCurrent)

  // Screen context: bindings resolve here; navigation is handled by the focus tree.
  useInputContext(
    'currentWork',
    useMemo(
      () => ({ 'agent.abort': onPress(() => void abortCurrent()) }),
      [abortCurrent],
    ),
    CONTEXT_ORDER.screen,
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

  const title = current
    ? (sessions[`${current.engineId}:${current.sessionId}`]?.title ?? 'Task')
    : 'New task'

  const entries = useMemo<TaskSwitcherEntry[]>(() => {
    return Object.entries(sessions)
      .flatMap(([key, summary]) => {
        const ref = keyParts(key)
        if (!ref) return []
        return [
          {
            ref,
            summary,
            hasPending:
              (pendingPermissions[key]?.length ?? 0) > 0 ||
              (pendingQuestions[key]?.length ?? 0) > 0,
          },
        ]
      })
      .sort((a, b) => b.summary.updatedAt - a.summary.updatedAt)
  }, [sessions, pendingPermissions, pendingQuestions])

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
        } else if (event.code === 'Backspace') {
          event.preventDefault()
          if (current) setConfirmOpen(true)
        }
        return
      }
      if (!event.ctrlKey) return
      if (event.code === 'KeyK') {
        event.preventDefault()
        setSwitcherOpen((open) => !open)
      } else if (event.code === 'KeyN') {
        event.preventDefault()
        newTask()
      } else if (event.code === 'Equal' || event.code === 'NumpadAdd') {
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
  }, [current, newTask, adjustZoom])

  return (
    <div className="flex h-full flex-col bg-surface text-text">
      <StatusBar title={title} onOpenTasks={() => setSwitcherOpen(true)} />
      <CurrentWork />
      <GamepadDebug open={gamepadOpen} onOpenChange={setGamepadOpen} />
      <MicDebug open={micOpen} onOpenChange={setMicOpen} />
      <EngineDebug open={engineOpen} onOpenChange={setEngineOpen} />
      <FocusDebugOverlay open={focusDebugOpen} />
      <TaskSwitcher
        open={switcherOpen}
        onOpenChange={setSwitcherOpen}
        entries={entries}
        onSelect={(ref) => void openSession(ref)}
      />
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete task"
        description="This deletes the session from the engine. The temporary switcher is the only place that can do this."
        confirmLabel="Delete"
        destructive
        onConfirm={() => void deleteCurrentSession()}
      />
    </div>
  )
}
