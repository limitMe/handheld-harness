import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Settings } from '@shared/ipc'
import { emptyBindingLayer, resolveActionMap, type BindingLayer } from '@shared/input'
import { InputContext, type InputApi } from './context'
import { useInputDebugStore } from './debugStore'
import {
  DEFAULT_DEADZONE,
  diffControlStates,
  isAnalogControl,
  readGamepadStates,
  type ControlStates,
} from './gamepad'
import { GestureResolver } from './gestures'
import { formatKeyCombo, isEditableElement, isModifierKey } from './keyboard'
import { InputRouter } from './router'
import type { CapturedControl, InputActionEvent } from './types'

function readPads(): Gamepad[] {
  return Array.from(navigator.getGamepads()).filter(
    (pad): pad is Gamepad => pad !== null && pad.connected,
  )
}

/** Sticks capture their direction so a rebind can distinguish up from down. */
function captureControl(control: string, value: number): string {
  if (!isAnalogControl(control)) return control
  return `${control}${value < 0 ? '-' : '+'}`
}

export function InputProvider({ children }: { children: ReactNode }) {
  const [router] = useState(() => new InputRouter(resolveActionMap(undefined, emptyBindingLayer())))
  const [gesture] = useState(
    () =>
      new GestureResolver({ resolve: (control, phase) => router.resolveGamepad(control, phase) }),
  )

  const userBindingsRef = useRef<BindingLayer>(emptyBindingLayer())
  const padIdRef = useRef<string | undefined>(undefined)
  const captureRef = useRef<((control: CapturedControl) => void) | null>(null)
  const previousStatesRef = useRef<ControlStates>({})

  const rebuild = useCallback(() => {
    router.setMap(resolveActionMap(padIdRef.current, userBindingsRef.current))
  }, [router])

  useEffect(() => {
    const bridge = window.handheld
    if (!bridge) return
    let disposed = false
    const apply = (settings: Settings): void => {
      userBindingsRef.current = settings.input
      rebuild()
    }
    bridge.settings
      .get()
      .then((settings) => {
        if (!disposed) apply(settings)
      })
      .catch(() => undefined)
    const off = bridge.events.on('settings:changed', apply)
    return () => {
      disposed = true
      off()
    }
  }, [rebuild])

  useEffect(() => {
    const store = useInputDebugStore.getState()
    const offDispatch = router.subscribe((record) => {
      store.record({
        action: record.event.action,
        phase: record.event.phase,
        source: record.event.source,
        control: record.event.control,
        handled: record.handled,
        contextId: record.contextId,
        at: performance.now(),
      })
    })
    const offContexts = router.subscribeContexts((ids) => store.setContexts(ids))
    return () => {
      offDispatch()
      offContexts()
    }
  }, [router])

  useEffect(() => {
    let frame = 0
    const loop = (): void => {
      const pad = readPads()[0]
      const id = pad?.id
      if (id !== padIdRef.current) {
        padIdRef.current = id
        previousStatesRef.current = {}
        rebuild()
        for (const event of gesture.reset()) router.dispatch(event)
      }

      const now = performance.now()
      const states = pad ? readGamepadStates(pad, DEFAULT_DEADZONE) : {}
      const changes = diffControlStates(previousStatesRef.current, states)
      previousStatesRef.current = states

      const events: InputActionEvent[] = []
      for (const change of changes) {
        if (captureRef.current && change.pressed) {
          const resolve = captureRef.current
          captureRef.current = null
          resolve({ source: 'gamepad', control: captureControl(change.control, change.value) })
          continue
        }
        events.push(...gesture.handle(change, now))
      }
      events.push(...gesture.tick(now))
      for (const event of events) router.dispatch(event)

      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [router, gesture, rebuild])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.isComposing || isModifierKey(event.key)) return
      const combo = formatKeyCombo(event)

      const capture = captureRef.current
      if (capture) {
        captureRef.current = null
        capture({ source: 'keyboard', control: combo })
        event.preventDefault()
        return
      }

      const action = router.resolveKeyboard(combo, isEditableElement(document.activeElement))
      if (!action) return
      const phase = event.repeat ? 'repeat' : 'start'
      if (router.dispatch({ action, phase, source: 'keyboard', control: combo })) {
        event.preventDefault()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [router])

  const api = useMemo<InputApi>(
    () => ({
      pushContext: (id, getHandlers) => router.pushContext(id, getHandlers),
      captureNextControl: () =>
        new Promise<CapturedControl>((resolve) => {
          captureRef.current = resolve
        }),
      cancelCapture: () => {
        captureRef.current = null
      },
    }),
    [router],
  )

  return <InputContext.Provider value={api}>{children}</InputContext.Provider>
}
