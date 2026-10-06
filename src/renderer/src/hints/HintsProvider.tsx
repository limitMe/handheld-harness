import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { DEFAULT_HINTS, type HintsSettings } from '@shared/hints'
import type { Settings } from '@shared/ipc'
import { useFocusTree } from '../focus'
import { useInputApi } from '../input'
import { isEditableElement } from '../input/keyboard'
import { AnchoredPanel } from '../ui'
import { ActionHints } from './ActionHints'
import { buildHintEntries, type HintEntry } from './entries'

/** Matches the gesture long-press threshold (spec 10) so the ring fills in time. */
const HOLD_MS = 400

interface Holding {
  control: string
  progress: number
}

/**
 * Shows action hints next to the focused, activated component after a period of
 * no input (spec 12). Content comes from the effective ActionMap, so rebinding
 * a control updates the hints.
 */
export function HintsProvider({ children }: { children: ReactNode }) {
  const tree = useFocusTree()
  const api = useInputApi()

  const [visible, setVisible] = useState(false)
  const [entries, setEntries] = useState<HintEntry[]>([])
  const [anchor, setAnchor] = useState<Element | null>(null)
  const [holding, setHolding] = useState<Holding | null>(null)

  const mapRef = useRef(api.getMap())
  const contextsRef = useRef<string[]>([])
  const activatedRef = useRef(false)
  const visibleRef = useRef(false)
  const entriesRef = useRef<HintEntry[]>([])
  const holdingRef = useRef<Holding | null>(null)
  const settingsRef = useRef<HintsSettings>(DEFAULT_HINTS)
  const timerRef = useRef(0)
  const rafRef = useRef(0)
  const holdStartRef = useRef(0)

  const updateVisible = useCallback((next: boolean) => {
    visibleRef.current = next
    setVisible(next)
  }, [])

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = 0
    }
  }, [])

  const stopHold = useCallback(() => {
    if (rafRef.current) {
      window.cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
    holdingRef.current = null
    setHolding(null)
  }, [])

  const hide = useCallback(() => {
    clearTimer()
    stopHold()
    updateVisible(false)
  }, [clearTimer, stopHold, updateVisible])

  const show = useCallback(() => {
    if (!activatedRef.current || !settingsRef.current.enabled || !tree) return
    const activatedId = tree.getActivatedId()
    const element = activatedId ? tree.getElement(activatedId) : null
    const next = buildHintEntries(mapRef.current, contextsRef.current, {
      editable: isEditableElement(document.activeElement),
    })
    if (!element || next.length === 0) return
    entriesRef.current = next
    setEntries(next)
    setAnchor(element)
    updateVisible(true)
  }, [tree, updateVisible])

  const schedule = useCallback(() => {
    clearTimer()
    if (!activatedRef.current || !settingsRef.current.enabled) return
    timerRef.current = window.setTimeout(show, settingsRef.current.delayMs)
  }, [clearTimer, show])

  const onInput = useCallback(() => {
    if (!activatedRef.current) return
    hide()
    schedule()
  }, [hide, schedule])

  const startHold = useCallback(
    (control: string) => {
      clearTimer()
      holdStartRef.current = performance.now()
      const tick = (): void => {
        const progress = Math.min(1, (performance.now() - holdStartRef.current) / HOLD_MS)
        const next = { control, progress }
        holdingRef.current = next
        setHolding(next)
        rafRef.current = progress < 1 ? window.requestAnimationFrame(tick) : 0
      }
      holdingRef.current = { control, progress: 0 }
      setHolding(holdingRef.current)
      updateVisible(true)
      rafRef.current = window.requestAnimationFrame(tick)
    },
    [clearTimer, updateVisible],
  )

  // Settings: hints are configurable and hot-reload (spec 12, P-09).
  useEffect(() => {
    const bridge = window.handheld
    if (!bridge) return
    let disposed = false
    const apply = (next: Settings): void => {
      const wasEnabled = settingsRef.current.enabled
      settingsRef.current = next.hints
      if (!next.hints.enabled) hide()
      else if (!wasEnabled) schedule()
    }
    bridge.settings
      .get()
      .then((next) => {
        if (!disposed) apply(next)
      })
      .catch(() => undefined)
    const off = bridge.events.on('settings:changed', apply)
    return () => {
      disposed = true
      off()
    }
  }, [hide, schedule])

  // Effective bindings and the context stack can change without remounting.
  useEffect(() => {
    const offMap = api.subscribeMap((map) => {
      mapRef.current = map
      if (visibleRef.current) show()
    })
    const offContexts = api.subscribeContexts((ids) => {
      contextsRef.current = ids
      if (visibleRef.current) show()
    })
    return () => {
      offMap()
      offContexts()
    }
  }, [api, show])

  // Focus / activation: hints only appear for the activated component.
  useEffect(() => {
    if (!tree) return
    const sync = (): void => {
      const activated = tree.getActivatedId() !== null
      if (activated === activatedRef.current) {
        if (activated && visibleRef.current) show()
        return
      }
      activatedRef.current = activated
      if (activated) schedule()
      else hide()
    }
    sync()
    return tree.subscribe(sync)
  }, [tree, schedule, hide, show])

  // Any raw input hides the hints and restarts the idle countdown. A press of a
  // hint's hold control keeps them up so its progress ring can fill.
  useEffect(() => {
    return api.subscribeControls((change) => {
      if (!activatedRef.current) return
      if (!visibleRef.current) {
        schedule()
        return
      }
      const isHold = entriesRef.current.some(
        (entry) => entry.phase === 'hold' && entry.control === change.control,
      )
      if (change.pressed && change.source === 'gamepad' && isHold) {
        startHold(change.control)
        return
      }
      if (!change.pressed && holdingRef.current?.control === change.control) {
        hide()
        schedule()
        return
      }
      if (change.pressed) onInput()
    })
  }, [api, schedule, startHold, onInput, hide])

  return (
    <>
      {children}
      <AnchoredPanel
        open={visible && entries.length > 0}
        anchor={anchor}
        side="top"
        align="end"
        className="pointer-events-none"
      >
        <ActionHints entries={entries} holding={holding} />
      </AnchoredPanel>
    </>
  )
}
