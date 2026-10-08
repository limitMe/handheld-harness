import { useCallback, useEffect, useRef, useState } from 'react'
import type { Settings, SettingsPatch, SpeechProviderId } from '@shared/ipc'
import { SPEECH_PROVIDER_NONE, type SpeechProviderInfo } from '@shared/speech'
import { useTranslation } from '../i18n'
import { ChoiceDialog, ConfirmDialog, Slider, cn, type ChoiceOption } from '../ui'
import { MenuGroupLabel, MenuRow } from './MenuRow'

interface InputDevice {
  deviceId: string
  label: string
  index: number
}

interface ResourceOption {
  id: string
  /** i18n key for the option label. */
  key: string
}

/** Doubao streaming resource ids (spec 16); the model and billing mode. */
const RESOURCE_OPTIONS: ResourceOption[] = [
  { id: 'volc.seedasr.sauc.duration', key: 'voice.resource.seedAsr2Duration' },
  { id: 'volc.seedasr.sauc.concurrent', key: 'voice.resource.seedAsr2Concurrent' },
  { id: 'volc.bigasr.sauc.duration', key: 'voice.resource.seedAsr1Duration' },
  { id: 'volc.bigasr.sauc.concurrent', key: 'voice.resource.seedAsr1Concurrent' },
]

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

export interface VoicePageProps {
  settings: Settings
  update: (patch: SettingsPatch) => Promise<void>
}

/** Voice input (spec 15/16): provider + credentials plus the microphone probe. */
export function VoicePage({ settings, update }: VoicePageProps) {
  const { t } = useTranslation()
  const [providers, setProviders] = useState<SpeechProviderInfo[]>([])
  const [providerOpen, setProviderOpen] = useState(false)
  const [resourceOpen, setResourceOpen] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)
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

  const saveKey = useCallback(async (): Promise<void> => {
    const speech = window.handheld?.speech
    const key = apiKey.trim()
    if (!speech || key.length === 0) return
    await speech.setKey(providerId, key)
    setApiKey('')
    setKeyConfigured(true)
    setStatus(t('voice.keySaved'))
  }, [apiKey, providerId, t])

  const clearKey = useCallback(async (): Promise<void> => {
    const speech = window.handheld?.speech
    if (!speech) return
    await speech.clearKey(providerId)
    setKeyConfigured(false)
    setStatus(t('voice.keyCleared'))
  }, [providerId, t])

  const currentDevice = devices.find((device) => device.deviceId === selected)
  const currentProvider = providers.find((provider) => provider.id === providerId)
  const currentResource = RESOURCE_OPTIONS.find((option) => option.id === resourceId)

  const providerLabel = (id: string, displayName?: string): string =>
    id === SPEECH_PROVIDER_NONE ? t('voice.none') : (displayName ?? id)

  const providerOptions: ChoiceOption[] = providers.map((provider) => ({
    id: provider.id,
    label: providerLabel(provider.id, provider.displayName),
    ...(provider.requiresCredentials ? { description: t('voice.requiresCredentials') } : {}),
  }))

  const resourceOptions: ChoiceOption[] = RESOURCE_OPTIONS.map((option) => ({
    id: option.id,
    label: t(option.key),
  }))

  return (
    <div data-testid="voice-page">
      <MenuGroupLabel>{t('menu.groups.speechProvider')}</MenuGroupLabel>
      <MenuRow
        id="system-menu.first"
        order={0}
        activatable
        testId="voice-provider"
        onActivate={() => setProviderOpen(true)}
        onClick={() => setProviderOpen(true)}
      >
        <span>{t('voice.provider')}</span>
        <span className="text-code text-text-muted">
          {providerLabel(providerId, currentProvider?.displayName)}
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
            <span>{t('voice.apiKey')}</span>
            <span className={cn('text-code', keyConfigured ? 'text-accent' : 'text-text-muted')}>
              {keyConfigured ? t('voice.configured') : t('voice.notSet')}
            </span>
          </MenuRow>
          <div className="px-3 pb-2">
            <input
              ref={keyInputRef}
              data-testid="voice-api-key-input"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={t('voice.keyPlaceholder')}
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
            <span>{t('voice.saveKey')}</span>
          </MenuRow>
          <MenuRow
            id="system-menu.voice.clearKey"
            order={3}
            testId="voice-clear-key"
            onActivate={() => setClearOpen(true)}
            onClick={() => setClearOpen(true)}
          >
            <span>{t('voice.clearKey')}</span>
          </MenuRow>
          <MenuRow
            id="system-menu.voice.resource"
            order={4}
            activatable
            testId="voice-resource"
            onActivate={() => setResourceOpen(true)}
            onClick={() => setResourceOpen(true)}
          >
            <span>{t('voice.modelBilling')}</span>
            <span className="text-code text-text-muted">
              {currentResource ? t(currentResource.key) : resourceId}
            </span>
          </MenuRow>
        </>
      ) : null}

      {status ? <p className="px-3 pt-2 text-code text-accent">{status}</p> : null}

      <div className="px-3 pt-2">
        <p className="text-base text-text-muted">{t('voice.help')}</p>
      </div>

      <MenuGroupLabel>{t('menu.groups.microphone')}</MenuGroupLabel>
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
        <span>{t('voice.inputDevice')}</span>
        <span className="text-code text-text-muted">
          {currentDevice
            ? currentDevice.label || t('voice.inputN', { index: currentDevice.index })
            : devices.length
              ? t('voice.select')
              : t('voice.noneFound')}
        </span>
      </MenuRow>

      <MenuRow
        id="system-menu.voice.test"
        order={11}
        testId="voice-test"
        onActivate={() => (active ? release() : void start())}
        onClick={() => (active ? release() : void start())}
      >
        <span>{active ? t('voice.stopTest') : t('voice.test')}</span>
        <span className={cn('text-code', active ? 'text-accent' : 'text-text-muted')}>
          {active ? t('voice.listening') : t('voice.idle')}
        </span>
      </MenuRow>

      <div className="px-3 pt-3">
        <Slider value={level} />
        <p className="pt-2 text-code text-text-muted">
          {t('voice.level', { value: level.toFixed(3) })}
        </p>
        {error ? <p className="pt-2 text-code text-danger">{error}</p> : null}
      </div>

      <ChoiceDialog
        open={providerOpen}
        onOpenChange={setProviderOpen}
        title={t('voice.provider')}
        description={t('voice.providerDescription')}
        options={providerOptions}
        initialId={providerId}
        onChoose={(id) => {
          void update({ speech: { provider: id as SpeechProviderId } })
        }}
      />

      <ChoiceDialog
        open={resourceOpen}
        onOpenChange={setResourceOpen}
        title={t('voice.modelBilling')}
        description={t('voice.resourceDescription')}
        options={resourceOptions}
        initialId={resourceId}
        onChoose={(id) => {
          void update({ speech: { doubao: { resourceId: id } } })
        }}
      />

      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title={t('voice.clearKeyTitle')}
        description={t('voice.clearKeyConfirm')}
        confirmLabel={t('voice.clearKey')}
        destructive
        onConfirm={() => void clearKey()}
      />
    </div>
  )
}
