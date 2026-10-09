import { randomUUID } from 'node:crypto'
import WebSocket from 'ws'
import {
  OPENAI_PROVIDER_ID,
  OPENAI_SAMPLE_RATE,
  SPEECH_SAMPLE_RATE,
  type SpeechErrorCode,
  type SpeechEvent,
  type SpeechProvider,
  type SpeechProviderInfo,
  type SpeechSessionOptions,
} from '../../shared/speech'
import { resamplePcm16 } from './resample'
import { SpeechNotConfiguredError, type SpeechProviderFactory } from './service'

export const OPENAI_INFO: SpeechProviderInfo = {
  id: OPENAI_PROVIDER_ID,
  displayName: 'OpenAI realtime',
  streaming: true,
  languages: ['auto', 'zh-CN', 'en-US'],
  offline: false,
  requiresCredentials: true,
}

interface OpenAiProviderConfig {
  apiKey: string
  model: string
  endpoint: string
}

interface OpenAiProviderDeps {
  emit(event: SpeechEvent): void
  log(message: string, meta?: Record<string, unknown>): void
}

interface OpenAiError {
  message?: string
  code?: string
  type?: string
}

interface OpenAiEvent {
  type?: string
  delta?: string
  transcript?: string
  error?: OpenAiError
  session?: { id?: string }
}

/** ISO-639-1 code for the `languages`/`language` session field, or `undefined` for auto. */
export function openAiLanguageCode(language: string | undefined): string | undefined {
  if (!language || language === 'auto') return undefined
  const base = language.split('-')[0]?.toLowerCase()
  return base && base.length > 0 ? base : undefined
}

/** `gpt-live-transcribe`/`gpt-transcribe` take `languages`; the 4o models take `language`. */
function usesLanguagesField(model: string): boolean {
  return model.startsWith('gpt-live') || model === 'gpt-transcribe'
}

/**
 * The GA transcription session config (spec 16). The recommended
 * `gpt-live-transcribe` streams deltas while audio arrives and returns the final
 * transcript after `input_audio_buffer.commit`; `turn_detection` must be null.
 */
export function buildOpenAiSessionUpdate(model: string, options: SpeechSessionOptions): unknown {
  const transcription: Record<string, unknown> = { model }
  const language = openAiLanguageCode(options.language)
  if (language) {
    if (usesLanguagesField(model)) transcription.languages = [language]
    else transcription.language = language
  }
  if (options.hints?.length) {
    if (usesLanguagesField(model)) transcription.keywords = options.hints.slice(0, 50)
    else transcription.prompt = options.hints.join(', ').slice(0, 1000)
  }
  return {
    type: 'session.update',
    session: {
      type: 'transcription',
      audio: {
        input: {
          format: { type: 'audio/pcm', rate: OPENAI_SAMPLE_RATE },
          transcription,
          turn_detection: null,
        },
      },
    },
  }
}

function codeFromError(error: OpenAiError | undefined): SpeechErrorCode {
  const text = `${error?.type ?? ''} ${error?.code ?? ''} ${error?.message ?? ''}`
  if (/auth|api[_ -]?key|401|403/i.test(text)) return 'auth-failed'
  if (/network|timeout|connection/i.test(text)) return 'network'
  return 'provider-error'
}

interface OpenAiConnection {
  id: string
  socket: WebSocket
  open: boolean
  started: boolean
  emittedEnd: boolean
  audioBytes: number
  partial: string
  completed: boolean
  onFinished?: () => void
}

export function createOpenAiFactory(): SpeechProviderFactory {
  return {
    info: OPENAI_INFO,
    create(ctx) {
      const apiKey = ctx.credentials.get(OPENAI_PROVIDER_ID)
      if (!apiKey) {
        throw new SpeechNotConfiguredError(
          'OpenAI API key is not set (System menu › Voice input)',
        )
      }
      return createOpenAiProvider(
        {
          apiKey,
          model: ctx.settings.speech.openai.model,
          endpoint: ctx.settings.speech.openai.endpoint,
        },
        { emit: ctx.emit, log: ctx.log },
      )
    },
  }
}

export function createOpenAiProvider(
  config: OpenAiProviderConfig,
  deps: OpenAiProviderDeps,
): SpeechProvider {
  let connection: OpenAiConnection | undefined

  function emitError(id: string, code: SpeechErrorCode, message: string): void {
    deps.emit({ type: 'error', sessionId: id, code, message })
  }

  function finish(conn: OpenAiConnection): void {
    conn.onFinished?.()
  }

  function handleEvent(conn: OpenAiConnection, raw: string): void {
    let event: OpenAiEvent
    try {
      event = JSON.parse(raw) as OpenAiEvent
    } catch (error) {
      deps.log('speech: dropped an undecodable OpenAI frame', { error: String(error) })
      return
    }
    switch (event.type) {
      case 'conversation.item.input_audio_transcription.delta': {
        const delta = event.delta ?? ''
        if (!delta) return
        conn.partial += delta
        deps.emit({ type: 'partial', sessionId: conn.id, text: conn.partial })
        return
      }
      case 'conversation.item.input_audio_transcription.completed': {
        conn.completed = true
        conn.partial = ''
        deps.emit({ type: 'final', sessionId: conn.id, text: event.transcript ?? '' })
        finish(conn)
        return
      }
      case 'conversation.item.input_audio_transcription.failed':
      case 'error': {
        emitError(
          conn.id,
          codeFromError(event.error),
          event.error?.message ?? 'OpenAI rejected the request',
        )
        if (connection === conn) connection = undefined
        conn.emittedEnd = true
        try {
          conn.socket.terminate()
        } catch {
          // Already closing.
        }
        return
      }
      default:
        return
    }
  }

  return {
    info: () => OPENAI_INFO,

    start(options) {
      return new Promise<string>((resolve, reject) => {
        const id = randomUUID()
        const socket = new WebSocket(config.endpoint, {
          headers: { Authorization: `Bearer ${config.apiKey}` },
        })
        const conn: OpenAiConnection = {
          id,
          socket,
          open: false,
          started: false,
          emittedEnd: false,
          audioBytes: 0,
          partial: '',
          completed: false,
        }
        connection = conn
        let settled = false
        let fallback: ReturnType<typeof setTimeout> | undefined

        const markStarted = (): void => {
          if (settled || conn.started) return
          conn.started = true
          settled = true
          if (fallback) clearTimeout(fallback)
          deps.emit({ type: 'started', sessionId: id })
          resolve(id)
        }

        socket.on('open', () => {
          conn.open = true
          try {
            socket.send(JSON.stringify(buildOpenAiSessionUpdate(config.model, options)))
          } catch (error) {
            emitError(id, 'unknown', `Failed to send the session config: ${String(error)}`)
          }
          // Some server builds confirm with `session.created` but not
          // `session.updated`; start anyway if the ack is slow.
          fallback = setTimeout(markStarted, 1500)
        })

        socket.on('message', (data) => {
          const raw = frameToString(data)
          if (!settled) {
            const type = peekType(raw)
            if (type === 'session.updated') {
              markStarted()
            } else if (type === 'error') {
              // The config was rejected: fail fast instead of waiting for the ack.
              handleEvent(conn, raw)
              if (!settled) {
                settled = true
                if (fallback) clearTimeout(fallback)
                reject(new Error(peekErrorMessage(raw)))
              }
              return
            }
          }
          handleEvent(conn, raw)
        })

        socket.on('unexpected-response', (_request, response) => {
          if (connection === conn) connection = undefined
          response.resume()
          try {
            socket.terminate()
          } catch {
            // Already closing.
          }
          if (settled) return
          settled = true
          if (fallback) clearTimeout(fallback)
          const status = response.statusCode ?? 0
          reject(new Error(`OpenAI handshake failed with HTTP ${status} (check the API key)`))
        })

        socket.on('error', (error) => {
          if (connection === conn) connection = undefined
          if (!settled) {
            settled = true
            if (fallback) clearTimeout(fallback)
            reject(error instanceof Error ? error : new Error(String(error)))
            return
          }
          if (!conn.emittedEnd) emitError(id, 'network', error.message)
        })

        socket.on('close', (code) => {
          if (connection === conn) connection = undefined
          if (fallback) clearTimeout(fallback)
          if (!settled) {
            settled = true
            reject(new Error(`OpenAI socket closed before the session started (${code})`))
            return
          }
          finish(conn)
        })
      })
    },

    pushAudio(sessionId, pcm) {
      const conn = connection
      if (!conn || conn.id !== sessionId || !conn.open || !conn.started) return
      if (conn.socket.readyState !== WebSocket.OPEN) return
      const resampled = resamplePcm16(pcm, SPEECH_SAMPLE_RATE, OPENAI_SAMPLE_RATE)
      conn.audioBytes += resampled.byteLength
      conn.socket.send(
        JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: Buffer.from(
            resampled.buffer,
            resampled.byteOffset,
            resampled.byteLength,
          ).toString('base64'),
        }),
      )
    },

    stop(sessionId) {
      const conn = connection
      if (!conn || conn.id !== sessionId) return Promise.resolve()
      connection = undefined
      return new Promise<void>((resolve) => {
        let done = false
        const close = (): void => {
          if (done) return
          done = true
          conn.onFinished = undefined
          conn.emittedEnd = true
          try {
            conn.socket.terminate()
          } catch {
            // Already closing.
          }
          deps.emit({ type: 'ended', sessionId: conn.id })
          resolve()
        }
        conn.onFinished = close
        if (!conn.open || conn.socket.readyState !== WebSocket.OPEN || conn.audioBytes === 0) {
          close()
          return
        }
        setTimeout(close, 8000)
        try {
          conn.socket.send(JSON.stringify({ type: 'input_audio_buffer.commit' }))
        } catch {
          close()
        }
      })
    },

    cancel(sessionId) {
      const conn = connection
      if (!conn || conn.id !== sessionId) return
      connection = undefined
      conn.onFinished = undefined
      conn.emittedEnd = true
      try {
        conn.socket.terminate()
      } catch {
        // Already closing.
      }
      deps.emit({ type: 'ended', sessionId: conn.id })
    },
  }
}

function frameToString(data: unknown): string {
  if (typeof data === 'string') return data
  if (Buffer.isBuffer(data)) return data.toString('utf8')
  if (Array.isArray(data)) return Buffer.concat(data as Buffer[]).toString('utf8')
  return Buffer.from(data as ArrayBuffer).toString('utf8')
}

function peekType(raw: string): string | undefined {
  try {
    return (JSON.parse(raw) as OpenAiEvent).type
  } catch {
    return undefined
  }
}

function peekErrorMessage(raw: string): string {
  try {
    const event = JSON.parse(raw) as OpenAiEvent
    return event.error?.message ?? 'OpenAI rejected the session config'
  } catch {
    return 'OpenAI rejected the session config'
  }
}
