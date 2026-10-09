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

/** Fun-ASR-Realtime (Alibaba Cloud Model Studio / DashScope) defaults (spec 16). */
export const FUNASR_PROVIDER_ID = 'funasr'
export const FUNASR_DEFAULT_MODEL = 'fun-asr-realtime'
export const FUNASR_DEFAULT_ENDPOINT = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference'
/** Model aliases offered in the picker; any `fun-asr-*` id can be typed in the probe. */
export const FUNASR_MODELS = [
  'fun-asr-realtime',
  'fun-asr-realtime-2025-11-07',
  'fun-asr-realtime-2026-02-28',
  'fun-asr-flash-8k-realtime',
] as const
/** Only these Fun-ASR models accept the `context` (hot-word) field. */
export const FUNASR_CONTEXT_MODELS = new Set(['fun-asr-realtime', 'fun-asr-realtime-2025-11-07'])

/** OpenAI realtime transcription defaults (spec 16). */
export const OPENAI_PROVIDER_ID = 'openai'
export const OPENAI_DEFAULT_MODEL = 'gpt-live-transcribe'
export const OPENAI_DEFAULT_ENDPOINT = 'wss://api.openai.com/v1/realtime?intent=transcription'
/** Realtime transcription sessions only accept 24 kHz mono PCM input. */
export const OPENAI_SAMPLE_RATE = 24000
export const OPENAI_MODELS = [
  'gpt-live-transcribe',
  'gpt-4o-transcribe',
  'gpt-4o-mini-transcribe',
  'gpt-transcribe',
  'gpt-realtime-whisper',
] as const

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
