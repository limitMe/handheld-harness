import { useCallback, useEffect, useRef, useState } from 'react'
import type { Settings, SpeechProviderId } from '@shared/ipc'
import type { SpeechProviderInfo } from '@shared/speech'
import { startMicCapture, type MicCapture } from '../speech/capture'
import { Button, Overlay } from '../ui'
import type { DebugOverlayProps } from './types'

/**
 * Temporary verification entry point for the speech layer (spec 16, P-06).
 * It captures the microphone, streams it through `window.handheld.speech` and
 * shows the live partial/final results. The system-menu Voice page will replace
 * this once the real dictation UI lands.
 */
export default function SpeechDebug({ open, onOpenChange }: DebugOverlayProps) {
  const [providers, setProviders] = useState<SpeechProviderInfo[]>([])
  const [settings, setSettings] = useState<Settings>()
  const [keyConfigured, setKeyConfigured] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [resourceId, setResourceId] = useState('')
  const [endpoint, setEndpoint] = useState('')
  const [status, setStatus] = useState('Idle')
  const [level, setLevel] = useState(0)
  const [finalText, setFinalText] = useState('')
  const [partialText, setPartialText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const captureRef = useRef<MicCapture | null>(null)
  const sessionRef = useRef<string | undefined>(undefined)

  const providerId = settings?.speech.provider ?? 'none'

  const stopCapture = useCallback((): void => {
    captureRef.current?.stop()
    captureRef.current = null
    setLevel(0)
  }, [])

  const refreshKeyStatus = useCallback(async (id: string): Promise<void> => {
    const speech = window.handheld?.speech
    if (!speech) return
    try {
      const { configured } = await speech.keyStatus(id)
      setKeyConfigured(configured)
    } catch {
      setKeyConfigured(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const bridge = window.handheld
    if (!bridge) return
    let cancelled = false
    void bridge.speech
      .providers()
      .then((list) => {
        if (!cancelled) setProviders(list)
      })
      .catch(() => undefined)
    void bridge.settings
      .get()
      .then((next) => {
        if (cancelled) return
        setSettings(next)
        setResourceId(next.speech.doubao.resourceId)
        setEndpoint(next.speech.doubao.endpoint)
        void refreshKeyStatus(next.speech.provider)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [open, refreshKeyStatus])

  useEffect(() => {
    const speech = window.handheld?.speech
    if (!speech) return
    return speech.onEvent((event) => {
      switch (event.type) {
        case 'started':
          setStatus('Listening…')
          break
        case 'partial':
          setPartialText(event.text)
          break
        case 'final':
          setFinalText((previous) => previous + event.text)
          setPartialText('')
          break
        case 'level':
          setLevel(event.rms)
          break
        case 'error':
          setError(`${event.code}: ${event.message}`)
          setStatus('Error')
          stopCapture()
          break
        case 'ended':
          setStatus('Idle')
          stopCapture()
          break
      }
    })
  }, [stopCapture])

  useEffect(() => () => stopCapture(), [stopCapture])

  const handleOpenChange = useCallback(
    (next: boolean): void => {
      if (!next) {
        stopCapture()
        const active = sessionRef.current
        sessionRef.current = undefined
        if (active) void window.handheld?.speech.cancel(active)
      }
      onOpenChange(next)
    },
    [onOpenChange, stopCapture],
  )

  const start = useCallback(async (): Promise<void> => {
    const speech = window.handheld?.speech
    if (!speech) return
    stopCapture()
    setError(null)
    setFinalText('')
    setPartialText('')
    setStatus('Connecting…')
    try {
      const { sessionId } = await speech.start()
      sessionRef.current = sessionId
      captureRef.current = await startMicCapture({
        onFrame: (pcm) =>
          void speech.pushAudio(
            sessionId,
            new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength),
          ),
        onError: (captureError) => setError(captureError.message),
      })
    } catch (startError) {
      sessionRef.current = undefined
      setStatus('Idle')
      setError(startError instanceof Error ? startError.message : String(startError))
    }
  }, [stopCapture])

  const stop = useCallback(async (): Promise<void> => {
    stopCapture()
    const active = sessionRef.current
    sessionRef.current = undefined
    setStatus('Idle')
    if (active) await window.handheld?.speech.stop(active)
  }, [stopCapture])

  const changeProvider = useCallback(
    async (id: string): Promise<void> => {
      const bridge = window.handheld
      if (!bridge) return
      const next = await bridge.settings.update({ speech: { provider: id as SpeechProviderId } })
      setSettings(next)
      await refreshKeyStatus(id)
    },
    [refreshKeyStatus],
  )

  const saveKey = useCallback(async (): Promise<void> => {
    const speech = window.handheld?.speech
    if (!speech || apiKey.trim().length === 0) return
    await speech.setKey('doubao', apiKey.trim())
    setApiKey('')
    await refreshKeyStatus('doubao')
  }, [apiKey, refreshKeyStatus])

  const clearKey = useCallback(async (): Promise<void> => {
    const speech = window.handheld?.speech
    if (!speech) return
    await speech.clearKey('doubao')
    await refreshKeyStatus('doubao')
  }, [refreshKeyStatus])

  const commitDoubao = useCallback(
    async (patch: { resourceId?: string; endpoint?: string }): Promise<void> => {
      const bridge = window.handheld
      if (!bridge) return
      const next = await bridge.settings.update({ speech: { doubao: patch } })
      setSettings(next)
    },
    [],
  )

  const listening = status === 'Listening…' || status === 'Connecting…'

  return (
    <Overlay
      open={open}
      onOpenChange={handleOpenChange}
      title="Speech probe"
      description="Press Ctrl+Shift+V to toggle. Verifies the provider connection and streams the microphone through the speech service."
    >
      <div data-testid="speech-debug" className="flex flex-col gap-4">
        <label className="flex flex-col gap-2 text-base">
          <span className="text-text-muted">Provider</span>
          <select
            className="rounded-md border border-surface-raised bg-card px-3 py-2 text-base text-on-card"
            value={providerId}
            onChange={(event) => void changeProvider(event.target.value)}
          >
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.displayName}
                {provider.requiresCredentials ? ' (API key required)' : ''}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-2 text-base">
          <span className="text-text-muted">
            Doubao API key{keyConfigured ? ' — configured' : ' — not set'}
          </span>
          <div className="flex items-center gap-2">
            <input
              type="password"
              className="min-w-0 flex-1 rounded-md border border-surface-raised bg-card px-3 py-2 text-base text-on-card"
              placeholder="Paste the Volcengine API key"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
            />
            <Button onClick={() => void saveKey()} disabled={apiKey.trim().length === 0}>
              Save
            </Button>
            <Button onClick={() => void clearKey()} disabled={!keyConfigured}>
              Clear
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-[8rem_1fr] items-center gap-2 text-base">
          <span className="text-text-muted">Resource ID</span>
          <input
            className="rounded-md border border-surface-raised bg-card px-3 py-2 text-code text-on-card"
            value={resourceId}
            onChange={(event) => setResourceId(event.target.value)}
            onBlur={() => void commitDoubao({ resourceId })}
          />
          <span className="text-text-muted">Endpoint</span>
          <input
            className="rounded-md border border-surface-raised bg-card px-3 py-2 text-code text-on-card"
            value={endpoint}
            onChange={(event) => setEndpoint(event.target.value)}
            onBlur={() => void commitDoubao({ endpoint })}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void start()} disabled={listening || providerId === 'none'}>
            Start
          </Button>
          <Button onClick={() => void stop()} disabled={!listening}>
            Stop
          </Button>
          <span className="text-text-muted">{status}</span>
        </div>

        <div className="rounded-card bg-card p-4 text-on-card">
          <div className="h-4 w-full overflow-hidden rounded-full bg-surface">
            <div
              className="h-full bg-accent transition-[width] duration-fast"
              style={{ width: `${Math.round(level * 100)}%` }}
            />
          </div>
          <p className="mt-2 text-code text-text-muted">level: {level.toFixed(3)}</p>
          <p className="mt-3 whitespace-pre-wrap">
            {finalText}
            <span className="text-text-muted underline">{partialText}</span>
          </p>
        </div>

        {error ? <p className="text-code text-danger">{error}</p> : null}
      </div>
    </Overlay>
  )
}
