import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from '../i18n'
import { Button, Overlay } from '../ui'
import type { DebugOverlayProps } from './types'

interface InputDevice {
  deviceId: string
  label: string
  index: number
}

interface StreamSettings {
  sampleRate: number
  channelCount: number
}

async function loadInputDevices(): Promise<InputDevice[]> {
  const all = await navigator.mediaDevices.enumerateDevices()
  return all
    .filter((device) => device.kind === 'audioinput')
    .map((device, index) => ({
      deviceId: device.deviceId,
      label: device.label,
      index: index + 1,
    }))
}

export default function MicDebug({ open, onOpenChange }: DebugOverlayProps) {
  const { t } = useTranslation()
  const [devices, setDevices] = useState<InputDevice[]>([])
  const [selected, setSelected] = useState('')
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState<string | null>(null)
  const [level, setLevel] = useState(0)
  const [settings, setSettings] = useState<StreamSettings | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const frameRef = useRef(0)

  const refreshDevices = useCallback(async (): Promise<void> => {
    try {
      const inputs = await loadInputDevices()
      setDevices(inputs)
      setSelected((prev) => prev || inputs[0]?.deviceId || '')
    } catch (err) {
      setError(t('debug.mic.enumerateFailed', { error: String(err) }))
    }
  }, [t])

  const releaseStream = useCallback((): void => {
    cancelAnimationFrame(frameRef.current)
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    void audioContextRef.current?.close()
    audioContextRef.current = null
  }, [])

  const stop = useCallback((): void => {
    releaseStream()
    setLevel(0)
    setStatus('idle')
  }, [releaseStream])

  const start = useCallback(async (): Promise<void> => {
    stop()
    setError(null)
    setStatus('requesting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selected ? { deviceId: { exact: selected } } : true,
      })
      streamRef.current = stream
      const track = stream.getAudioTracks()[0]
      const trackSettings = track?.getSettings() ?? {}
      setSettings({
        sampleRate: trackSettings.sampleRate ?? 0,
        channelCount: trackSettings.channelCount ?? 0,
      })

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
      setStatus('live')
      await refreshDevices()
    } catch (err) {
      setStatus('failed')
      const name = err instanceof Error ? err.name : 'Error'
      const message = err instanceof Error ? err.message : String(err)
      setError(`${name}: ${message}`)
    }
  }, [selected, refreshDevices, stop])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    loadInputDevices()
      .then((inputs) => {
        if (cancelled) return
        setDevices(inputs)
        setSelected((prev) => prev || inputs[0]?.deviceId || '')
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(t('debug.mic.enumerateFailed', { error: String(err) }))
      })
    return () => {
      cancelled = true
      releaseStream()
      setLevel(0)
      setStatus('idle')
    }
  }, [open, releaseStream, t])

  useEffect(() => () => releaseStream(), [releaseStream])

  return (
    <Overlay
      open={open}
      onOpenChange={onOpenChange}
      title={t('debug.mic.title')}
      description={t('debug.mic.description')}
    >
      <label className="flex flex-col gap-2 text-base">
        <span className="text-text-muted">{t('debug.mic.inputDevice')}</span>
        <select
          className="rounded-md border border-surface-raised bg-card px-3 py-2 text-base text-on-card"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
        >
          {devices.length === 0 ? <option value="">{t('debug.mic.noInputs')}</option> : null}
          {devices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || t('debug.mic.inputN', { index: device.index })}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void start()}>{t('debug.mic.start')}</Button>
        <Button onClick={stop}>{t('debug.mic.stop')}</Button>
        <Button onClick={() => void refreshDevices()}>{t('debug.mic.refresh')}</Button>
        <span className="text-text-muted">{t(`debug.mic.${status}`)}</span>
      </div>

      {error ? (
        <div className="rounded-card bg-card p-4 text-code text-danger">
          <p>{error}</p>
          <p className="mt-2 text-text-muted">{t('debug.mic.privacy')}</p>
        </div>
      ) : null}

      <div className="rounded-card bg-card p-4 text-on-card">
        <div className="h-4 w-full overflow-hidden rounded-full bg-surface">
          <div
            className="h-full bg-accent transition-[width] duration-fast"
            style={{ width: `${Math.round(level * 100)}%` }}
          />
        </div>
        <p className="mt-2 text-code text-text-muted">
          {t('debug.mic.level', {
            value: level.toFixed(3),
            sampleRate: settings?.sampleRate ?? '—',
            channels: settings?.channelCount ?? '—',
          })}
        </p>
      </div>
    </Overlay>
  )
}
