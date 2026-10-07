import { randomUUID } from 'node:crypto'
import WebSocket from 'ws'
import {
  DOUBAO_PROVIDER_ID,
  SPEECH_SAMPLE_RATE,
  type SpeechErrorCode,
  type SpeechEvent,
  type SpeechProvider,
  type SpeechProviderInfo,
  type SpeechSessionOptions,
} from '../../shared/speech'
import {
  MESSAGE_TYPE,
  decodeServerMessage,
  encodeAudioRequest,
  encodeFullClientRequest,
} from './doubao-protocol'
import { SpeechNotConfiguredError, type SpeechProviderFactory } from './service'

export const DOUBAO_INFO: SpeechProviderInfo = {
  id: DOUBAO_PROVIDER_ID,
  displayName: 'Doubao speech (Volcengine)',
  streaming: true,
  languages: ['auto', 'zh-CN', 'en-US'],
  offline: false,
  requiresCredentials: true,
}

interface DoubaoProviderConfig {
  apiKey: string
  resourceId: string
  endpoint: string
}

interface DoubaoProviderDeps {
  emit(event: SpeechEvent): void
  log(message: string, meta?: Record<string, unknown>): void
}

interface DoubaoUtterance {
  text?: string
  definite?: boolean
}

interface DoubaoResult {
  text?: string
  utterances?: DoubaoUtterance[]
}

interface DoubaoResponse {
  code?: number
  message?: string
  event?: number
  is_last_package?: boolean
  payload_msg?: { result?: DoubaoResult }
  result?: DoubaoResult | DoubaoResult[]
}

interface DoubaoConnection {
  id: string
  socket: WebSocket
  open: boolean
  emittedEnd: boolean
  lastFinal: string
  lastPartial: string
}

export function createDoubaoFactory(): SpeechProviderFactory {
  return {
    info: DOUBAO_INFO,
    create(ctx) {
      const apiKey = ctx.credentials.get(DOUBAO_PROVIDER_ID)
      if (!apiKey) {
        throw new SpeechNotConfiguredError(
          'Doubao API key is not set (System menu › Voice input)',
        )
      }
      return createDoubaoProvider(
        {
          apiKey,
          resourceId: ctx.settings.speech.doubao.resourceId,
          endpoint: ctx.settings.speech.doubao.endpoint,
        },
        { emit: ctx.emit, log: ctx.log },
      )
    },
  }
}

function frameToBuffer(data: unknown): Buffer {
  if (Buffer.isBuffer(data)) return data
  if (Array.isArray(data)) return Buffer.concat(data as Buffer[])
  return Buffer.from(data as ArrayBuffer)
}

/**
 * Split a Doubao response into the definite (final) text and the in-progress
 * (partial) text. With `enable_nonstream`, sentence endings are re-recognised
 * and only those utterances carry `definite: true` (spec 16).
 */
export function extractSegments(json: DoubaoResponse | undefined): {
  final: string
  partial: string
} {
  if (!json) return { final: '', partial: '' }
  const rawResult = json.payload_msg?.result ?? json.result
  const result = Array.isArray(rawResult) ? rawResult[0] : rawResult
  const utterances = result?.utterances ?? []
  let final = ''
  let partial = ''
  for (const utterance of utterances) {
    const text = utterance?.text ?? ''
    if (utterance?.definite === true) final += text
    else partial += text
  }
  if (utterances.length === 0 && typeof result?.text === 'string') partial = result.text
  return { final, partial }
}

export function createDoubaoProvider(
  config: DoubaoProviderConfig,
  deps: DoubaoProviderDeps,
): SpeechProvider {
  let connection: DoubaoConnection | undefined

  function buildRequest(options: SpeechSessionOptions): unknown {
    const request: Record<string, unknown> = {
      model_name: 'bigmodel',
      enable_nonstream: true,
      enable_itn: true,
      enable_punc: true,
      enable_ddc: true,
      show_utterances: true,
    }
    if (options.hints?.length) {
      request.corpus = {
        context: JSON.stringify({ hotwords: options.hints.map((word) => ({ word })) }),
      }
    }
    return {
      user: { uid: 'handheld-ai' },
      audio: {
        format: 'pcm',
        codec: 'raw',
        rate: options.sampleRate,
        bits: 16,
        channel: 1,
        ...(options.language && options.language !== 'auto' ? { language: options.language } : {}),
      },
      request,
    }
  }

  function emitError(id: string, code: SpeechErrorCode, message: string): void {
    deps.emit({ type: 'error', sessionId: id, code, message })
  }

  function handleFrame(conn: DoubaoConnection, data: unknown): void {
    let message
    try {
      message = decodeServerMessage(frameToBuffer(data))
    } catch (error) {
      deps.log('speech: dropped an undecodable frame', { error: String(error) })
      return
    }
    if (message.messageType === MESSAGE_TYPE.errorResponse) {
      emitError(conn.id, 'provider-error', message.errorMessage || 'Doubao rejected the request')
      return
    }
    const json = message.json as DoubaoResponse | undefined
    if (json && typeof json.code === 'number' && json.code !== 0) {
      emitError(
        conn.id,
        json.code === 401 || json.code === 403 ? 'auth-failed' : 'provider-error',
        json.message ?? `Doubao error code ${json.code}`,
      )
      return
    }
    const { final, partial } = extractSegments(json)
    if (final.startsWith(conn.lastFinal)) {
      const delta = final.slice(conn.lastFinal.length)
      conn.lastFinal = final
      if (delta) deps.emit({ type: 'final', sessionId: conn.id, text: delta })
    } else if (final !== conn.lastFinal) {
      deps.log('speech: final result changed unexpectedly', { from: conn.lastFinal, to: final })
      conn.lastFinal = final
    }
    if (partial !== conn.lastPartial) {
      conn.lastPartial = partial
      deps.emit({ type: 'partial', sessionId: conn.id, text: partial })
    }
  }

  return {
    info: () => DOUBAO_INFO,

    start(options) {
      return new Promise<string>((resolve, reject) => {
        const id = randomUUID()
        const socket = new WebSocket(config.endpoint, {
          headers: {
            'X-Api-Key': config.apiKey,
            'X-Api-Resource-Id': config.resourceId,
            'X-Api-Request-Id': id,
            'X-Api-Connect-Id': randomUUID(),
          },
        })
        socket.binaryType = 'nodebuffer'
        const conn: DoubaoConnection = {
          id,
          socket,
          open: false,
          emittedEnd: false,
          lastFinal: '',
          lastPartial: '',
        }
        connection = conn
        let settled = false

        socket.on('open', () => {
          conn.open = true
          try {
            socket.send(encodeFullClientRequest(buildRequest(options)))
          } catch (error) {
            emitError(id, 'unknown', `Failed to send the request: ${String(error)}`)
          }
          settled = true
          deps.emit({ type: 'started', sessionId: id })
          resolve(id)
        })

        socket.on('message', (data) => handleFrame(conn, data))

        socket.on('error', (error) => {
          if (connection === conn) connection = undefined
          if (!settled) {
            settled = true
            reject(error instanceof Error ? error : new Error(String(error)))
            return
          }
          if (!conn.emittedEnd) emitError(id, 'network', error.message)
        })

        socket.on('close', (code) => {
          if (connection === conn) connection = undefined
          if (!settled) {
            settled = true
            reject(new Error(`Doubao socket closed before opening (${code})`))
            return
          }
          if (conn.open && !conn.emittedEnd) {
            conn.emittedEnd = true
            deps.emit({ type: 'ended', sessionId: id })
          }
        })
      })
    },

    pushAudio(sessionId, pcm) {
      const conn = connection
      if (!conn || conn.id !== sessionId || !conn.open) return
      const audio = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
      conn.socket.send(encodeAudioRequest(audio, false))
    },

    stop(sessionId) {
      const conn = connection
      if (!conn || conn.id !== sessionId) return Promise.resolve()
      connection = undefined
      return new Promise<void>((resolve) => {
        let done = false
        const finish = (): void => {
          if (done) return
          done = true
          try {
            conn.socket.terminate()
          } catch {
            // Already closing.
          }
          resolve()
        }
        if (conn.socket.readyState === WebSocket.CLOSED) {
          finish()
          return
        }
        const timer = setTimeout(finish, 5000)
        conn.socket.once('close', () => {
          clearTimeout(timer)
          finish()
        })
        if (conn.open && conn.socket.readyState === WebSocket.OPEN) {
          // 100 ms of silence with the last-packet flag ends the stream cleanly.
          conn.socket.send(encodeAudioRequest(Buffer.alloc((SPEECH_SAMPLE_RATE / 10) * 2), true))
        } else {
          finish()
        }
      })
    },

    cancel(sessionId) {
      const conn = connection
      if (!conn || conn.id !== sessionId) return
      connection = undefined
      conn.emittedEnd = true
      try {
        conn.socket.terminate()
      } catch {
        // Already closing.
      }
      deps.emit({ type: 'ended', sessionId })
    },
  }
}
