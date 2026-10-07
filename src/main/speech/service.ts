import type { Settings } from '../../shared/ipc'
import {
  SPEECH_PROVIDER_NONE,
  SPEECH_SAMPLE_RATE,
  rmsOf,
  type SpeechEvent,
  type SpeechProvider,
  type SpeechProviderInfo,
  type SpeechSessionOptions,
} from '../../shared/speech'
import type { CredentialStore } from './credentials'

/** Thrown when dictation is asked for without a usable provider/credential. */
export class SpeechNotConfiguredError extends Error {
  readonly code = 'not-configured'

  constructor(message: string) {
    super(message)
    this.name = 'SpeechNotConfiguredError'
  }
}

export interface SpeechProviderContext {
  settings: Settings
  credentials: CredentialStore
  emit(event: SpeechEvent): void
  log(message: string, meta?: Record<string, unknown>): void
}

export interface SpeechProviderFactory {
  info: SpeechProviderInfo
  create(ctx: SpeechProviderContext): SpeechProvider
}

export interface SpeechServiceDeps {
  getSettings(): Settings
  credentials: CredentialStore
  emit(event: SpeechEvent): void
  log(message: string, meta?: Record<string, unknown>): void
}

const NONE_INFO: SpeechProviderInfo = {
  id: SPEECH_PROVIDER_NONE,
  displayName: 'None',
  streaming: false,
  languages: [],
  offline: true,
  requiresCredentials: false,
}

interface ActiveSession {
  sessionId: string
  provider: SpeechProvider
  lastLevel: number
}

/** Owns the single active dictation session and routes audio and events (spec 16). */
export class SpeechService {
  private active: ActiveSession | undefined

  constructor(
    private readonly deps: SpeechServiceDeps,
    private readonly factories: SpeechProviderFactory[],
  ) {}

  listProviders(): SpeechProviderInfo[] {
    return [NONE_INFO, ...this.factories.map((factory) => factory.info)]
  }

  async start(opts?: { language?: string; hints?: string[] }): Promise<string> {
    if (this.active) throw new SpeechNotConfiguredError('A dictation session is already running')
    const settings = this.deps.getSettings()
    const providerId = settings.speech.provider
    if (providerId === SPEECH_PROVIDER_NONE) {
      throw new SpeechNotConfiguredError('No speech provider is configured')
    }
    const factory = this.factories.find((entry) => entry.info.id === providerId)
    if (!factory) throw new SpeechNotConfiguredError(`Unknown speech provider: ${providerId}`)

    const provider = factory.create({
      settings,
      credentials: this.deps.credentials,
      emit: (event) => this.handleEvent(event),
      log: this.deps.log,
    })
    const options: SpeechSessionOptions = {
      language: opts?.language ?? settings.speech.language,
      sampleRate: SPEECH_SAMPLE_RATE,
      ...(opts?.hints ? { hints: opts.hints } : {}),
    }
    const sessionId = await provider.start(options)
    this.active = { sessionId, provider, lastLevel: 0 }
    return sessionId
  }

  pushAudio(sessionId: string, pcm: Int16Array): void {
    const active = this.active
    if (!active || active.sessionId !== sessionId) return
    active.provider.pushAudio(sessionId, pcm)
    const rms = rmsOf(pcm)
    if (Math.abs(rms - active.lastLevel) >= 0.01) {
      active.lastLevel = rms
      this.deps.emit({ type: 'level', sessionId, rms })
    }
  }

  async stop(sessionId: string): Promise<void> {
    const active = this.active
    if (!active || active.sessionId !== sessionId) return
    this.active = undefined
    await active.provider.stop(sessionId)
  }

  cancel(sessionId: string): void {
    const active = this.active
    if (!active || active.sessionId !== sessionId) return
    this.active = undefined
    active.provider.cancel(sessionId)
  }

  /** A terminal event releases the slot so the next dictation can start. */
  private handleEvent(event: SpeechEvent): void {
    this.deps.emit(event)
    if (
      (event.type === 'ended' || event.type === 'error') &&
      this.active?.sessionId === event.sessionId
    ) {
      this.active = undefined
    }
  }
}
