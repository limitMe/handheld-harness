import { useCallback, useEffect, useRef, useState } from 'react'
import { actionLabel } from '@shared/actions'
import { GamepadGlyph } from '../glyphs'
import { useTranslation } from '../i18n'
import { useInputDebugStore } from '../input'
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
  const { t } = useTranslation()
  const [pads, setPads] = useState<GamepadSnapshot[]>([])
  const [lastInputAgo, setLastInputAgo] = useState(0)
  const [events, setEvents] = useState<string[]>([])
  const [vibrationResult, setVibrationResult] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)

  const contexts = useInputDebugStore((state) => state.contexts)
  const actions = useInputDebugStore((state) => state.actions)
  const clearActions = useInputDebugStore((state) => state.clear)

  const previousRef = useRef('')
  const lastChangeRef = useRef(0)
  const recordingRef = useRef(false)
  const recordStartRef = useRef(0)
  const recordChangesRef = useRef<string[]>([])
  const recordTimerRef = useRef(0)

  useEffect(() => {
    const onConnected = (event: Event): void => {
      const pad = (event as GamepadEvent).gamepad
      setEvents((prev) =>
        [t('debug.gamepad.connectedEvent', { index: pad.index, id: pad.id }), ...prev].slice(0, 20),
      )
    }
    const onDisconnected = (event: Event): void => {
      const pad = (event as GamepadEvent).gamepad
      setEvents((prev) =>
        [t('debug.gamepad.disconnectedEvent', { index: pad.index }), ...prev].slice(0, 20),
      )
    }
    window.addEventListener('gamepadconnected', onConnected)
    window.addEventListener('gamepaddisconnected', onDisconnected)
    return () => {
      window.removeEventListener('gamepadconnected', onConnected)
      window.removeEventListener('gamepaddisconnected', onDisconnected)
    }
  }, [t])

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
      setVibrationResult(t('debug.gamepad.noGamepad'))
      return
    }
    const actuator = gamepad.vibrationActuator
    if (!actuator) {
      setVibrationResult(t('debug.gamepad.noActuator'))
      return
    }
    setVibrationResult(t('debug.gamepad.playing'))
    actuator
      .playEffect('dual-rumble', {
        startDelay: 0,
        duration: 600,
        weakMagnitude: 0.8,
        strongMagnitude: 0.8,
      })
      .then(() => setVibrationResult(t('debug.gamepad.played')))
      .catch((error: unknown) =>
        setVibrationResult(t('debug.gamepad.failed', { error: String(error) })),
      )
  }, [t])

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
      title={t('debug.gamepad.title')}
      description={t('debug.gamepad.description')}
    >
      <div className="flex flex-wrap items-center gap-4 text-base text-text-muted">
        <span>{t('debug.gamepad.visibility', { value: document.visibilityState })}</span>
        <span>{t('debug.gamepad.focused', { value: String(document.hasFocus()) })}</span>
        <span>{t('debug.gamepad.lastInput', { ms: lastInputAgo })}</span>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button onClick={testVibration}>{t('debug.gamepad.testVibration')}</Button>
        <Button onClick={recordTenSeconds} disabled={recording}>
          {recording ? t('debug.gamepad.recording') : t('debug.gamepad.record')}
        </Button>
        {vibrationResult ? (
          <span className="self-center text-text-muted">{vibrationResult}</span>
        ) : null}
      </div>

      {pads.length === 0 ? (
        <p className="text-base text-text-muted">{t('debug.gamepad.none')}</p>
      ) : (
        pads.map((pad) => (
          <section key={pad.index} className="rounded-card bg-card p-4 text-on-card">
            <h3 className="text-base font-semibold">
              #{pad.index} · {pad.id}
            </h3>
            <p className="text-code text-text-muted">
              {t('debug.gamepad.mapping', {
                mapping: pad.mapping || t('debug.gamepad.nonStandard'),
                connected: String(pad.connected),
                timestamp: pad.timestamp,
              })}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-1 text-code sm:grid-cols-3">
              {pad.buttons.map((button, i) => (
                <div key={i} className={button.pressed ? 'text-accent' : 'text-text-muted'}>
                  <span className="inline-flex items-center gap-1 align-middle">
                    <GamepadGlyph control={button.name} size={20} />
                    {button.pressed ? t('debug.gamepad.down') : t('debug.gamepad.up')} (
                    {formatValue(button.value)})
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-1 text-code sm:grid-cols-4">
              {pad.axes.map((axis, i) => (
                <div key={i} className="text-text-muted">
                  {t('debug.gamepad.axis', { index: i, value: formatValue(axis) })}
                </div>
              ))}
            </div>
          </section>
        ))
      )}

      <section className="rounded-card bg-card p-4 text-on-card">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold">{t('debug.gamepad.inputActions')}</h3>
          <Button onClick={clearActions}>{t('common.clear')}</Button>
        </div>
        <p className="mt-2 text-code text-text-muted">
          {t('debug.gamepad.contexts', {
            value: contexts.length === 0 ? t('debug.gamepad.noContexts') : contexts.join(' ▸ '),
          })}
        </p>
        {actions.length === 0 ? (
          <p className="text-code text-text-muted">{t('debug.gamepad.noActions')}</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1 text-code">
            {actions.map((entry) => (
              <li key={entry.seq} className={entry.handled ? 'text-accent' : 'text-text-muted'}>
                {t(`actions.${entry.action}`, { defaultValue: actionLabel(entry.action) })} ·{' '}
                {entry.phase} · {entry.source}:{entry.control}
                {entry.handled ? ` → ${entry.contextId}` : ` ${t('debug.gamepad.unhandled')}`}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-card bg-card p-4 text-on-card">
        <h3 className="text-base font-semibold">{t('debug.gamepad.connectionEvents')}</h3>
        {events.length === 0 ? (
          <p className="text-code text-text-muted">{t('debug.gamepad.noEvents')}</p>
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
