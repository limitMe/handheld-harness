import { randomUUID } from 'node:crypto'
import WebSocket from 'ws'
import {
  FUNASR_CONTEXT_MODELS,
  FUNASR_PROVIDER_ID,
  type SpeechErrorCode,
  type SpeechEvent,
  type SpeechProvider,
  type SpeechProviderInfo,
  type SpeechSessionOptions,
} from '../../shared/speech'
import { SpeechNotConfiguredError, type SpeechProviderFactory } from './service'

export const FUNASR_INFO: SpeechProviderInfo = {
  id: FUNASR_PROVIDER_ID,
  displayName: 'Fun-ASR (Alibaba Cloud)',
  streaming: true,
  languages: ['auto', 'zh-CN', 'en-US'],
  offline: false,
  requiresCredentials: true,
}

interface FunAsrProviderConfig {
  apiKey: string
  model: string
  endpoint: string
}

interface FunAsrProviderDeps {
  emit(event: SpeechEvent): void
  log(message: string, meta?: Record<string, unknown>): void
}

/** DashScope result payload: one sentence per `result-generated` event. */
interface FunAsrSentence {
  text?: string
  sentence_end?: boolean
  sentence_begin?: boolean
  sentence_id?: number
  heartbeat?: boolean
}

interface FunAsrEvent {
  header?: {
    event?: string
    task_id?: string
    error_code?: string
    error_message?: string
  }
  payload?: { output?: { sentence?: FunAsrSentence } }
}

export type FunAsrResultKind = 'ignore' | 'partial' | 'final'

export interface FunAsrResult {
  kind: FunAsrResultKind
  text: string
}

/**
 * Maps a `result-generated` event onto the protocol (spec 16). Intermediate
 * sentences (`sentence_end: false`) are provisional; ended sentences are final.
 * Heartbeats and the sentence-id-0 preamble are dropped.
 */
export function readFunAsrResult(json: FunAsrEvent | undefined): FunAsrResult {
  const sentence = json?.payload?.output?.sentence
  if (!sentence || sentence.heartbeat === true || sentence.sentence_id === 0) {
    return { kind: 'ignore', text: '' }
  }
  const text = sentence.text ?? ''
  return { kind: sentence.sentence_end === true ? 'final' : 'partial', text }
}

/** Maps `zh-CN` / `en-US` onto the ISO-639-1 hints Fun-ASR expects. */
export function funAsrLanguageHint(language: string | undefined): string | undefined {
  if (!language || language === 'auto') return undefined
  const base = language.split('-')[0]?.toLowerCase()
  return base && base.length > 0 ? base : undefined
}

export function buildFunAsrRunTask(
  taskId: string,
  model: string,
  options: SpeechSessionOptions,
): unknown {
  const language = funAsrLanguageHint(options.language)
  const parameters: Record<string, unknown> = {
    format: 'pcm',
    sample_rate: options.sampleRate,
    heartbeat: true,
  }
  if (language) parameters.language_hints = [language]

  const input: Record<string, unknown> = {}
  if (options.hints?.length && FUNASR_CONTEXT_MODELS.has(model)) {
    input.context = [
      {
        role: 'user',
        content: [{ type: 'input_text', text: options.hints.join('、').slice(0, 400) }],
      },
    ]
  }

  return {
    header: { action: 'run-task', task_id: taskId, streaming: 'duplex' },
    payload: {
      task_group: 'audio',
      task: 'asr',
      function: 'recognition',
      model,
      parameters,
      input,
    },
  }
}

function buildFinishTask(taskId: string): unknown {
  return {
    header: { action: 'finish-task', task_id: taskId, streaming: 'duplex' },
    payload: { input: {} },
  }
}

function codeFromError(event: FunAsrEvent): SpeechErrorCode {
  const code = event.header?.error_code ?? ''
  if (/auth|permission|unauthor/i.test(code)) return 'auth-failed'
  if (/network|timeout/i.test(code)) return 'network'
  return 'provider-error'
}

interface FunAsrConnection {
  id: string
  socket: WebSocket
  open: boolean
  started: boolean
  emittedEnd: boolean
  lastPartial: string
  /** Set when the server rejects the task before it starts. */
  failure?: string
  onFinished?: () => void
}

export function createFunAsrFactory(): SpeechProviderFactory {
  return {
    info: FUNASR_INFO,
    create(ctx) {
      const apiKey = ctx.credentials.get(FUNASR_PROVIDER_ID)
      if (!apiKey) {
        throw new SpeechNotConfiguredError(
          'Fun-ASR API key is not set (System menu › Voice input)',
        )
      }
      return createFunAsrProvider(
        {
          apiKey,
          model: ctx.settings.speech.funasr.model,
          endpoint: ctx.settings.speech.funasr.endpoint,
        },
        { emit: ctx.emit, log: ctx.log },
      )
    },
  }
}

export function createFunAsrProvider(
  config: FunAsrProviderConfig,
  deps: FunAsrProviderDeps,
): SpeechProvider {
  let connection: FunAsrConnection | undefined

  function emitError(id: string, code: SpeechErrorCode, message: string): void {
    deps.emit({ type: 'error', sessionId: id, code, message })
  }

  function handleMessage(conn: FunAsrConnection, raw: string): void {
    let event: FunAsrEvent
    try {
      event = JSON.parse(raw) as FunAsrEvent
    } catch (error) {
      deps.log('speech: dropped an undecodable Fun-ASR frame', { error: String(error) })
      return
    }
    switch (event.header?.event) {
      case 'task-started': {
        if (conn.started) return
        conn.started = true
        deps.emit({ type: 'started', sessionId: conn.id })
        return
      }
      case 'result-generated': {
        const result = readFunAsrResult(event)
        if (result.kind === 'partial') {
          if (result.text !== conn.lastPartial) {
            conn.lastPartial = result.text
            deps.emit({ type: 'partial', sessionId: conn.id, text: result.text })
          }
        } else if (result.kind === 'final') {
          conn.lastPartial = ''
          deps.emit({ type: 'final', sessionId: conn.id, text: result.text })
        }
        return
      }
      case 'task-finished': {
        conn.onFinished?.()
        return
      }
      case 'task-failed': {
        const message =
          event.header?.error_message ?? event.header?.error_code ?? 'Fun-ASR task failed'
        conn.failure = message
        emitError(conn.id, codeFromError(event), message)
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
    info: () => FUNASR_INFO,

    start(options) {
      return new Promise<string>((resolve, reject) => {
        const id = randomUUID()
        const socket = new WebSocket(config.endpoint, {
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'user-agent': 'handheld-ai',
          },
        })
        const conn: FunAsrConnection = {
          id,
          socket,
          open: false,
          started: false,
          emittedEnd: false,
          lastPartial: '',
        }
        connection = conn
        let settled = false

        socket.on('open', () => {
          conn.open = true
          try {
            socket.send(JSON.stringify(buildFunAsrRunTask(id, config.model, options)))
          } catch (error) {
            emitError(id, 'unknown', `Failed to send the request: ${String(error)}`)
          }
        })

        socket.on('message', (data) => {
          handleMessage(conn, frameToString(data))
          if (settled) return
          // Resolve once the server confirms the task and audio may flow.
          if (conn.failure !== undefined) {
            settled = true
            reject(new Error(conn.failure))
            return
          }
          if (conn.started) {
            settled = true
            resolve(id)
          }
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
          const status = response.statusCode ?? 0
          reject(new Error(`Fun-ASR handshake failed with HTTP ${status} (check the API key)`))
        })

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
            reject(new Error(`Fun-ASR socket closed before the task started (${code})`))
            return
          }
          conn.onFinished?.()
        })
      })
    },

    pushAudio(sessionId, pcm) {
      const conn = connection
      if (!conn || conn.id !== sessionId || !conn.open || !conn.started) return
      if (conn.socket.readyState !== WebSocket.OPEN) return
      conn.socket.send(Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength))
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
        conn.onFinished = finish
        if (!conn.open || conn.socket.readyState !== WebSocket.OPEN) {
          finish()
          return
        }
        setTimeout(finish, 5000)
        try {
          conn.socket.send(JSON.stringify(buildFinishTask(conn.id)))
        } catch {
          finish()
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
