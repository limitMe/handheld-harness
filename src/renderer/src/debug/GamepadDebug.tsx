import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Overlay } from '../ui'
import type { DebugOverlayProps } from './types'

const BUTTON_NAMES = [
  'A',
  'B',
  'X',
  'Y',
  'LB',
  'RB',
  'LT',
  'RT',
  'Back',
  'Start',
  'LS',
  'RS',
  'Up',
  'Down',
  'Left',
  'Right',
  'Guide',
]

interface ButtonSnapshot {
  name: string
  pressed: boolean
  value: number
}

interface GamepadSnapshot {
  index: number
  id: string
  mapping: string
  connected: boolean
  timestamp: number
  buttons: ButtonSnapshot[]
  axes: number[]
}

function readGamepads(): GamepadSnapshot[] {
  return Array.from(navigator.getGamepads())
    .filter((pad): pad is Gamepad => pad !== null)
    .map((pad) => ({
      index: pad.index,
      id: pad.id,
      mapping: pad.mapping,
      connected: pad.connected,
      timestamp: Math.round(pad.timestamp),
      buttons: pad.buttons.map((button, i) => ({
        name: BUTTON_NAMES[i] ?? `#${i}`,
        pressed: button.pressed,
        value: button.value,
      })),
      axes: [...pad.axes],
    }))
}

/** Coarse signature used to detect "input changed" across frames. */
function serialize(pads: GamepadSnapshot[]): string {
  return JSON.stringify(
    pads.map((pad) => ({
      i: pad.index,
      b: pad.buttons.map((button) => (button.pressed ? 1 : 0)),
      a: pad.axes.map((value) => Math.round(value * 100) / 100),
    })),
  )
}

function formatValue(value: number): string {
  return value.toFixed(2)
}

export default function GamepadDebug({ open, onOpenChange }: DebugOverlayProps) {
  const [pads, setPads] = useState<GamepadSnapshot[]>([])
  const [lastInputAgo, setLastInputAgo] = useState(0)
  const [events, setEvents] = useState<string[]>([])
  const [vibrationResult, setVibrationResult] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)

  const previousRef = useRef('')
  const lastChangeRef = useRef(0)
  const recordingRef = useRef(false)
  const recordStartRef = useRef(0)
  const recordChangesRef = useRef<string[]>([])
  const recordTimerRef = useRef(0)

  useEffect(() => {
    const onConnected = (event: Event): void => {
      const pad = (event as GamepadEvent).gamepad
      setEvents((prev) => [`connected #${pad.index} ${pad.id}`, ...prev].slice(0, 20))
    }
    const onDisconnected = (event: Event): void => {
      const pad = (event as GamepadEvent).gamepad
      setEvents((prev) => [`disconnected #${pad.index}`, ...prev].slice(0, 20))
    }
    window.addEventListener('gamepadconnected', onConnected)
    window.addEventListener('gamepaddisconnected', onDisconnected)
    return () => {
      window.removeEventListener('gamepadconnected', onConnected)
      window.removeEventListener('gamepaddisconnected', onDisconnected)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    let frame = 0
    previousRef.current = serialize(readGamepads())
    lastChangeRef.current = performance.now()
    const tick = (): void => {
      const snapshots = readGamepads()
      const serialized = serialize(snapshots)
      if (serialized !== previousRef.current) {
        previousRef.current = serialized
        lastChangeRef.current = performance.now()
        if (recordingRef.current) {
          recordChangesRef.current.push(
            `${Math.round(performance.now() - recordStartRef.current)}ms ${serialized}`,
          )
        }
      }
      setPads(snapshots)
      setLastInputAgo(Math.round(performance.now() - lastChangeRef.current))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [open])

  useEffect(() => () => window.clearTimeout(recordTimerRef.current), [])

  const testVibration = useCallback((): void => {
    const gamepad = Array.from(navigator.getGamepads()).find((pad): pad is Gamepad => pad !== null)
    if (!gamepad) {
      setVibrationResult('No gamepad connected')
      return
    }
    const actuator = gamepad.vibrationActuator
    if (!actuator) {
      setVibrationResult('No vibrationActuator exposed by this gamepad')
      return
    }
    setVibrationResult('playing dual-rumble...')
    actuator
      .playEffect('dual-rumble', {
        startDelay: 0,
        duration: 600,
        weakMagnitude: 0.8,
        strongMagnitude: 0.8,
      })
      .then(() => setVibrationResult('dual-rumble played'))
      .catch((error: unknown) => setVibrationResult(`failed: ${String(error)}`))
  }, [])

  const recordTenSeconds = useCallback((): void => {
    recordingRef.current = true
    recordStartRef.current = performance.now()
    recordChangesRef.current = []
    setRecording(true)
    recordTimerRef.current = window.setTimeout(() => {
      recordingRef.current = false
      setRecording(false)
      window.handheld.log.write('info', 'gamepad probe (10s)', {
        category: 'gamepad-probe',
        changes: recordChangesRef.current,
      })
    }, 10_000)
  }, [])

  return (
    <Overlay
      open={open}
      onOpenChange={onOpenChange}
      title="Gamepad probe"
      description="Press Ctrl+Shift+G to toggle. Polls navigator.getGamepads() every frame."
    >
      <div className="flex flex-wrap items-center gap-4 text-base text-text-muted">
        <span>visibility: {document.visibilityState}</span>
        <span>focused: {String(document.hasFocus())}</span>
        <span>last input: {lastInputAgo} ms ago</span>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button onClick={testVibration}>Test vibration</Button>
        <Button onClick={recordTenSeconds} disabled={recording}>
          {recording ? 'Recording...' : 'Record 10s'}
        </Button>
        {vibrationResult ? <span className="self-center text-text-muted">{vibrationResult}</span> : null}
      </div>

      {pads.length === 0 ? (
        <p className="text-base text-text-muted">No gamepad connected.</p>
      ) : (
        pads.map((pad) => (
          <section key={pad.index} className="rounded-card bg-card p-4 text-on-card">
            <h3 className="text-base font-semibold">
              #{pad.index} · {pad.id}
            </h3>
            <p className="text-code text-text-muted">
              mapping: {pad.mapping || 'non-standard'} · connected: {String(pad.connected)} · timestamp:{' '}
              {pad.timestamp}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-1 text-code sm:grid-cols-3">
              {pad.buttons.map((button, i) => (
                <div key={i} className={button.pressed ? 'text-accent' : 'text-text-muted'}>
                  {button.name}: {button.pressed ? 'down' : 'up'} ({formatValue(button.value)})
                </div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-1 text-code sm:grid-cols-4">
              {pad.axes.map((axis, i) => (
                <div key={i} className="text-text-muted">
                  axis {i}: {formatValue(axis)}
                </div>
              ))}
            </div>
          </section>
        ))
      )}

      <section className="rounded-card bg-card p-4 text-on-card">
        <h3 className="text-base font-semibold">Connection events</h3>
        {events.length === 0 ? (
          <p className="text-code text-text-muted">No events yet.</p>
        ) : (
          <ul className="text-code text-text-muted">
            {events.map((entry, i) => (
              <li key={i}>{entry}</li>
            ))}
          </ul>
        )}
      </section>
    </Overlay>
  )
}
