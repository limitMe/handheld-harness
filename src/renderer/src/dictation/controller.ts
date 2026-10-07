import type { SpeechEvent } from '@shared/speech'
import type { DictationAudio } from './audio'
import { DictationEditor, type EditResult } from './editor'
import type { DictationTarget } from './target'

export type DictationStatus = 'idle' | 'starting' | 'listening'

/** Subset of `window.handheld.speech` the controller needs. */
export interface DictationSpeechBridge {
  start(opts?: { language?: string; hints?: string[] }): Promise<{ sessionId: string }>
  pushAudio(sessionId: string, pcm: Uint8Array): Promise<void>
  stop(sessionId: string): Promise<void>
  cancel(sessionId: string): Promise<void>
  onEvent(listener: (event: SpeechEvent) => void): () => void
}

export interface DictationControllerOptions {
  speech(): DictationSpeechBridge | undefined
  audio: DictationAudio
  setStatus(status: DictationStatus): void
  setLevel(level: number): void
  setError(error: string | null): void
  pulse?(): void
}

/** How long to wait for `ended` before settling a stop anyway. */
const SETTLE_TIMEOUT_MS = 2500

/**
 * Dictation lifecycle (spec 16): long-press Y starts a speech session, streams
 * the microphone and writes partial/final text into the registered target;
 * releasing Y stops it and B cancels and rolls the inserted text back.
 */
export class DictationController {
  private target: DictationTarget | null = null
  private editor: DictationEditor | null = null
  private sessionId: string | null = null
  private starting = false
  private pendingStop = false
  private settleTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly options: DictationControllerOptions) {}

  /** Subscribes to speech events; call once from a React effect. */
  connect(): () => void {
    const speech = this.options.speech()
    if (!speech) return () => undefined
    return speech.onEvent((event) => this.handleEvent(event))
  }

  registerTarget(target: DictationTarget | null): void {
    this.target = target
  }

  get active(): boolean {
    return this.sessionId !== null || this.starting
  }

  /** Pre-warm the microphone on the raw Y press so the first word is not clipped. */
  warm(): void {
    if (!this.target) return
    this.options.audio.warm()
  }

  releaseAudio(): void {
    if (!this.active) this.options.audio.release()
  }

  async start(): Promise<void> {
    if (this.active) return
    const target = this.target
    if (!target || !target.isAlive()) return
    const speech = this.options.speech()
    if (!speech) return
    if (!target.isActivated()) target.activate()

    this.starting = true
    this.pendingStop = false
    this.options.setError(null)
    this.options.setStatus('starting')
    try {
      const { sessionId } = await speech.start()
      // `cancel()` / `finish()` may have run while the provider was starting;
      // drop the session they never saw instead of writing into the field.
      if (!this.starting) {
        void speech.cancel(sessionId)
        return
      }
      this.starting = false
      if (this.pendingStop) {
        this.pendingStop = false
        await this.stop()
        return
      }
      const selection = target.getSelection()
      this.editor = new DictationEditor({
        value: target.getValue(),
        selectionStart: selection.start,
        selectionEnd: selection.end,
      })
      this.sessionId = sessionId
      target.apply(this.editor.initial())
      this.options.setStatus('listening')
      this.options.audio.consume((pcm) => {
        void speech.pushAudio(sessionId, toBytes(pcm))
      })
      this.options.pulse?.()
    } catch (error) {
      this.starting = false
      this.options.setStatus('idle')
      this.options.setError(friendlyError(error))
      this.options.audio.release()
    }
  }

  async stop(): Promise<void> {
    if (this.starting) {
      this.pendingStop = true
      return
    }
    const sessionId = this.sessionId
    if (!sessionId) return
    this.options.audio.release()
    this.options.pulse?.()
    this.armSettleTimeout()
    await this.options.speech()?.stop(sessionId)
  }

  cancel(): void {
    const sessionId = this.sessionId
    this.starting = false
    this.pendingStop = false
    this.sessionId = null
    if (sessionId) void this.options.speech()?.cancel(sessionId)
    this.settle('discard')
  }

  /**
   * Ends the session now, keeping the text already written into the field. Used
   * when the field is consumed (send): it promotes the pending partial once and
   * detaches, so late `partial`/`final`/`ended` events cannot write it back.
   */
  finish(): void {
    const editor = this.editor
    const target = this.target
    const sessionId = this.sessionId
    this.clearSettleTimer()
    this.starting = false
    this.pendingStop = false
    this.sessionId = null
    this.editor = null
    if (sessionId) void this.options.speech()?.stop(sessionId)
    this.options.audio.release()
    this.options.setStatus('idle')
    this.options.setLevel(0)
    if (editor && target?.isAlive()) target.apply(editor.finalize())
  }

  private handleEvent(event: SpeechEvent): void {
    if (!this.sessionId || event.sessionId !== this.sessionId) return
    switch (event.type) {
      case 'partial':
        this.edit((editor) => editor.setPartial(event.text))
        break
      case 'final':
        this.edit((editor) => editor.commitFinal(event.text))
        break
      case 'level':
        this.options.setLevel(event.rms)
        break
      case 'error':
        this.options.setError(`${event.code}: ${event.message}`)
        this.settle('keep')
        break
      case 'ended':
        this.settle('keep')
        break
      case 'started':
        break
    }
  }

  /** Applies an edit unless the field moved, which ends the session (spec 16). */
  private edit(next: (editor: DictationEditor) => EditResult): void {
    const editor = this.editor
    const target = this.target
    if (!editor || !target?.isAlive()) {
      this.settle('keep')
      return
    }
    const expected = editor.expectedSelection
    const current = target.getSelection()
    if (current.start !== expected.start || current.end !== expected.end) {
      this.settle('keep')
      return
    }
    target.apply(next(editor))
  }

  private settle(mode: 'keep' | 'discard'): void {
    this.clearSettleTimer()
    const editor = this.editor
    const target = this.target
    this.sessionId = null
    this.editor = null
    this.starting = false
    this.pendingStop = false
    this.options.audio.release()
    this.options.setStatus('idle')
    this.options.setLevel(0)
    if (editor && target?.isAlive()) {
      target.apply(mode === 'keep' ? editor.finalize() : editor.undo())
    }
  }

  private armSettleTimeout(): void {
    this.clearSettleTimer()
    this.settleTimer = setTimeout(() => {
      if (this.sessionId) this.settle('keep')
    }, SETTLE_TIMEOUT_MS)
  }

  private clearSettleTimer(): void {
    if (this.settleTimer === null) return
    clearTimeout(this.settleTimer)
    this.settleTimer = null
  }
}

function toBytes(pcm: Int16Array): Uint8Array {
  return new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)
}

/** Turns the main-process failure into a hint a handheld user can act on (spec 16). */
function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/provider is configured/i.test(message)) {
    return 'No speech provider configured — use Windows dictation (Win+H) or pick one under System menu › Voice input.'
  }
  if (/API key/i.test(message)) {
    return 'The speech API key is missing — add it under System menu › Voice input.'
  }
  return message
}
