import { useCallback, useEffect, useRef, useState } from 'react'
import { Slider, cn } from '../ui'
import { MenuGroupLabel, MenuRow } from './MenuRow'

interface InputDevice {
  deviceId: string
  label: string
}

async function loadInputDevices(): Promise<InputDevice[]> {
  const all = await navigator.mediaDevices.enumerateDevices()
  return all
    .filter((device) => device.kind === 'audioinput')
    .map((device, index) => ({
      deviceId: device.deviceId,
      label: device.label || `Input ${index + 1}`,
    }))
}

/**
 * Voice-input placeholder (spec 15, P-06). The provider is not chosen yet, so
 * this page reports the system input and offers a microphone level test reused
 * from the microphone probe (spec 01).
 */
export function VoicePage() {
  const [devices, setDevices] = useState<InputDevice[]>([])
  const [selected, setSelected] = useState('')
  const [active, setActive] = useState(false)
  const [level, setLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const frameRef = useRef(0)

  const release = useCallback((): void => {
    cancelAnimationFrame(frameRef.current)
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    void audioContextRef.current?.close()
    audioContextRef.current = null
    setLevel(0)
    setActive(false)
  }, [])

  useEffect(() => {
    loadInputDevices()
      .then((inputs) => {
        setDevices(inputs)
        setSelected((prev) => prev || inputs[0]?.deviceId || '')
      })
      .catch((err: unknown) => setError(String(err)))
    return release
  }, [release])

  const start = useCallback(async (): Promise<void> => {
    release()
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selected ? { deviceId: { exact: selected } } : true,
      })
      streamRef.current = stream
      const context = new AudioContext()
      audioContextRef.current = context
      const analyser = context.createAnalyser()
      analyser.fftSize = 2048
      context.createMediaStreamSource(stream).connect(analyser)
      const data = new Uint8Array(analyser.fftSize)
      const tick = (): void => {
        analyser.getByteTimeDomainData(data)
        let peak = 0
        for (const value of data) peak = Math.max(peak, Math.abs(value - 128) / 128)
        setLevel(peak)
        frameRef.current = requestAnimationFrame(tick)
      }
      frameRef.current = requestAnimationFrame(tick)
      setActive(true)
    } catch (err) {
      setError(err instanceof Error ? `${err.name}: ${err.message}` : String(err))
    }
  }, [release, selected])

  const cycleDevice = (delta: number): void => {
    if (devices.length === 0) return
    const index = Math.max(
      0,
      devices.findIndex((device) => device.deviceId === selected),
    )
    const next = (index + delta + devices.length) % devices.length
    setSelected(devices[next]?.deviceId ?? '')
  }

  const current = devices.find((device) => device.deviceId === selected)

  return (
    <div data-testid="voice-page">
      <div className="mb-2 rounded-md border border-surface-raised bg-surface px-3 py-3 text-base">
        <p className="font-medium">System voice input (Win+H)</p>
        <p className="text-text-muted">
          Dictation uses the Windows input method for now. Choosing a speech provider comes later
          (P-06).
        </p>
      </div>

      <MenuGroupLabel>Microphone</MenuGroupLabel>
      <MenuRow
        id="system-menu.first"
        order={0}
        activatable
        testId="voice-device"
        onActivate={() => undefined}
        onNavigate={(direction) => {
          if (direction === 'left' || direction === 'right') {
            cycleDevice(direction === 'left' ? -1 : 1)
            return 'handled'
          }
          return 'pass'
        }}
      >
        <span>Input device</span>
        <span className="text-code text-text-muted">
          {current?.label ?? (devices.length ? 'Select…' : 'None found')}
        </span>
      </MenuRow>

      <MenuRow
        id="system-menu.voice.test"
        order={1}
        testId="voice-test"
        onActivate={() => (active ? release() : void start())}
        onClick={() => (active ? release() : void start())}
      >
        <span>{active ? 'Stop test' : 'Test microphone'}</span>
        <span className={cn('text-code', active ? 'text-accent' : 'text-text-muted')}>
          {active ? 'Listening…' : 'Idle'}
        </span>
      </MenuRow>

      <div className="px-3 pt-3">
        <Slider value={level} />
        <p className="pt-2 text-code text-text-muted">level: {level.toFixed(3)}</p>
        {error ? <p className="pt-2 text-code text-danger">{error}</p> : null}
      </div>
    </div>
  )
}
