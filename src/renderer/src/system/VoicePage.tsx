import { useCallback, useEffect, useRef, useState } from 'react'
import type { Settings, SettingsPatch, SpeechProviderId } from '@shared/ipc'
import type { SpeechProviderInfo } from '@shared/speech'
import { Slider, cn } from '../ui'
import { MenuGroupLabel, MenuRow } from './MenuRow'

interface InputDevice {
  deviceId: string
  label: string
}

interface ResourceOption {
  id: string
  label: string
}

/** Doubao streaming resource ids (spec 16); the model and billing mode. */
const RESOURCE_OPTIONS: ResourceOption[] = [
  { id: 'volc.seedasr.sauc.duration', label: 'Seed-ASR 2.0 · hourly' },
  { id: 'volc.seedasr.sauc.concurrent', label: 'Seed-ASR 2.0 · concurrent' },
  { id: 'volc.bigasr.sauc.duration', label: 'Seed-ASR 1.0 · hourly' },
  { id: 'volc.bigasr.sauc.concurrent', label: 'Seed-ASR 1.0 · concurrent' },
]

async function loadInputDevices(): Promise<InputDevice[]> {
  const all = await navigator.mediaDevices.enumerateDevices()
  return all
    .filter((device) => device.kind === 'audioinput')
    .map((device, index) => ({
      deviceId: device.deviceId,
      label: device.label || `Input ${index + 1}`,
    }))
}

export interface VoicePageProps {
  settings: Settings
  update: (patch: SettingsPatch) => Promise<void>
}

/** Voice input (spec 15/16): provider + credentials plus the microphone probe. */
export function VoicePage({ settings, update }: VoicePageProps) {
  const providersRef = useRef<SpeechProviderInfo[]>([])
  const [providers, setProviders] = useState<SpeechProviderInfo[]>([])
  const [keyConfigured, setKeyConfigured] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const keyInputRef = useRef<HTMLInputElement>(null)

  const [devices, setDevices] = useState<InputDevice[]>([])
  const [selected, setSelected] = useState('')
  const [active, setActive] = useState(false)
  const [level, setLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const frameRef = useRef(0)

  const providerId = settings.speech.provider
  const resourceId = settings.speech.doubao.resourceId

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

  useEffect(() => {
    const speech = window.handheld?.speech
    if (!speech) return
    let cancelled = false
    void speech
      .providers()
      .then((list) => {
        if (cancelled) return
        providersRef.current = list
        setProviders(list)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const speech = window.handheld?.speech
    if (!speech) return
    let cancelled = false
    void speech
      .keyStatus(providerId)
      .then(({ configured }) => {
        if (!cancelled) setKeyConfigured(configured)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [providerId])

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

  const cycleProvider = useCallback(
    (delta: number): void => {
      const list = providersRef.current
      if (list.length === 0) return
      const index = Math.max(
        0,
        list.findIndex((provider) => provider.id === providerId),
      )
      const next = list[(index + delta + list.length) % list.length]
      if (next) void update({ speech: { provider: next.id as SpeechProviderId } })
    },
    [providerId, update],
  )

  const cycleResource = useCallback(
    (delta: number): void => {
      const index = Math.max(
        0,
        RESOURCE_OPTIONS.findIndex((option) => option.id === resourceId),
      )
      const next = RESOURCE_OPTIONS[(index + delta + RESOURCE_OPTIONS.length) % RESOURCE_OPTIONS.length]
      if (next) void update({ speech: { doubao: { resourceId: next.id } } })
    },
    [resourceId, update],
  )

  const saveKey = useCallback(async (): Promise<void> => {
    const speech = window.handheld?.speech
    const key = apiKey.trim()
    if (!speech || key.length === 0) return
    await speech.setKey(providerId, key)
    setApiKey('')
    setKeyConfigured(true)
    setStatus('API key saved.')
  }, [apiKey, providerId])

  const clearKey = useCallback(async (): Promise<void> => {
    const speech = window.handheld?.speech
    if (!speech) return
    await speech.clearKey(providerId)
    setKeyConfigured(false)
    setStatus('API key cleared.')
  }, [providerId])

  const currentDevice = devices.find((device) => device.deviceId === selected)
  const currentProvider = providers.find((provider) => provider.id === providerId)
  const currentResource = RESOURCE_OPTIONS.find((option) => option.id === resourceId)

  return (
    <div data-testid="voice-page">
      <MenuGroupLabel>Speech provider</MenuGroupLabel>
      <MenuRow
        id="system-menu.first"
        order={0}
        activatable
        testId="voice-provider"
        onActivate={() => cycleProvider(1)}
        onClick={() => cycleProvider(1)}
        onNavigate={(direction) => {
          if (direction === 'left' || direction === 'right') {
            cycleProvider(direction === 'left' ? -1 : 1)
            return 'handled'
          }
          return 'pass'
        }}
      >
        <span>Provider</span>
        <span className="text-code text-text-muted">
          {currentProvider?.displayName ?? 'None'}
        </span>
      </MenuRow>

      {providerId !== 'none' ? (
        <>
          <MenuRow
            id="system-menu.voice.key"
            order={1}
            activatable
            testId="voice-api-key"
            onActivate={() => keyInputRef.current?.focus()}
          >
            <span>API key</span>
            <span className={cn('text-code', keyConfigured ? 'text-accent' : 'text-text-muted')}>
              {keyConfigured ? 'Configured' : 'Not set'}
            </span>
          </MenuRow>
          <div className="px-3 pb-2">
            <input
              ref={keyInputRef}
              data-testid="voice-api-key-input"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="Paste the Volcengine API key, then choose Save"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              className="w-full rounded-md border border-surface-raised bg-card px-3 py-2 text-base text-on-card placeholder:text-text-muted"
            />
          </div>
          <MenuRow
            id="system-menu.voice.saveKey"
            order={2}
            testId="voice-save-key"
            onActivate={() => void saveKey()}
            onClick={() => void saveKey()}
          >
            <span>Save API key</span>
          </MenuRow>
          <MenuRow
            id="system-menu.voice.clearKey"
            order={3}
            testId="voice-clear-key"
            onActivate={() => void clearKey()}
            onClick={() => void clearKey()}
          >
            <span>Clear API key</span>
          </MenuRow>
          <MenuRow
            id="system-menu.voice.resource"
            order={4}
            activatable
            testId="voice-resource"
            onActivate={() => cycleResource(1)}
            onClick={() => cycleResource(1)}
            onNavigate={(direction) => {
              if (direction === 'left' || direction === 'right') {
                cycleResource(direction === 'left' ? -1 : 1)
                return 'handled'
              }
              return 'pass'
            }}
          >
            <span>Model / billing</span>
            <span className="text-code text-text-muted">{currentResource?.label ?? resourceId}</span>
          </MenuRow>
        </>
      ) : null}

      {status ? <p className="px-3 pt-2 text-code text-accent">{status}</p> : null}

      <div className="px-3 pt-2">
        <p className="text-base text-text-muted">
          Hold Y (or Ctrl+D) while an input is active to dictate. Without a provider, dictation is
          unavailable — Windows dictation (Win+H) still works.
        </p>
      </div>

      <MenuGroupLabel>Microphone</MenuGroupLabel>
      <MenuRow
        id="system-menu.voice.device"
        order={10}
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
          {currentDevice?.label ?? (devices.length ? 'Select…' : 'None found')}
        </span>
      </MenuRow>

      <MenuRow
        id="system-menu.voice.test"
        order={11}
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
