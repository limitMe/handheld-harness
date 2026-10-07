/**
 * Provider-agnostic speech-recognition protocol (spec 16).
 *
 * The renderer captures 16 kHz mono PCM and frames it to the main process; the
 * main process keeps the credentials and the network, runs one `SpeechProvider`
 * and pushes `SpeechEvent`s back. `partial` results are provisional and replace
 * the temporary text at the cursor; `final` results are appended.
 */

export const SPEECH_SAMPLE_RATE = 16000

/** Sentinels for the settings-selected provider: `none` disables dictation. */
export const SPEECH_PROVIDER_NONE = 'none'

/** Language tag that lets the provider auto-detect Chinese/English mixed speech. */
export const SPEECH_DEFAULT_LANGUAGE = 'auto'

/** Doubao (Volcengine) streaming ASR defaults (spec 16, P-06). */
export const DOUBAO_PROVIDER_ID = 'doubao'
export const DOUBAO_DEFAULT_RESOURCE_ID = 'volc.seedasr.sauc.duration'
export const DOUBAO_DEFAULT_ENDPOINT =
  'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async'

export type SpeechErrorCode =
  | 'not-configured'
  | 'auth-failed'
  | 'network'
  | 'provider-error'
  | 'cancelled'
  | 'unknown'

export interface SpeechProviderInfo {
  id: string
  displayName: string
  /** True when the provider emits `partial` results while audio streams in. */
  streaming: boolean
  /** Language tags the provider supports; `['auto']` means mixed detection. */
  languages: string[]
  /** True when no network is required. */
  offline: boolean
  /** True when the provider needs an API key before it can start (P-20). */
  requiresCredentials: boolean
}

export interface SpeechSessionOptions {
  language: string
  sampleRate: typeof SPEECH_SAMPLE_RATE
  /** Vocabulary hints, e.g. repository file and symbol names. */
  hints?: string[]
}

export type SpeechEvent =
  | { type: 'started'; sessionId: string }
  | { type: 'partial'; sessionId: string; text: string }
  | { type: 'final'; sessionId: string; text: string }
  | { type: 'level'; sessionId: string; rms: number }
  | { type: 'error'; sessionId: string; code: SpeechErrorCode; message: string }
  | { type: 'ended'; sessionId: string }

export interface SpeechProvider {
  info(): SpeechProviderInfo
  /** Resolves with the session id once the provider is ready to take audio. */
  start(opts: SpeechSessionOptions): Promise<string>
  pushAudio(sessionId: string, pcm: Int16Array): void
  /** Waits for the final results before resolving. */
  stop(sessionId: string): Promise<void>
  cancel(sessionId: string): void
}

/** Root-mean-square of a PCM frame in [0, 1]; used for the dictation level meter. */
export function rmsOf(pcm: Int16Array): number {
  if (pcm.length === 0) return 0
  let sum = 0
  for (const sample of pcm) {
    const normalized = sample / 32768
    sum += normalized * normalized
  }
  return Math.sqrt(sum / pcm.length)
}
