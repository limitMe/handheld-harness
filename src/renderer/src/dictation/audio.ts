import { SPEECH_SAMPLE_RATE } from '@shared/speech'
import { startMicCapture, type MicCapture } from '../speech/capture'

/** Roughly 300 ms of audio, kept warm so the first word is not clipped (spec 16). */
const PREROLL_MS = 300

export interface DictationAudio {
  /** Start capture and buffer the last `PREROLL_MS` of audio. */
  warm(): void
  /** Attach a consumer; the buffered pre-roll is flushed into it first. */
  consume(onFrame: (pcm: Int16Array) => void): void
  /** Detach and release the microphone. */
  release(): void
}

export interface DictationAudioOptions {
  onError?(error: Error): void
}

export function createDictationAudio(options: DictationAudioOptions = {}): DictationAudio {
  let desired = false
  let capture: MicCapture | null = null
  let starting = false
  let consumer: ((pcm: Int16Array) => void) | null = null
  let preroll: Int16Array[] = []
  let prerollSamples = 0

  const maxPrerollSamples = Math.round((SPEECH_SAMPLE_RATE * PREROLL_MS) / 1000)

  function onFrame(pcm: Int16Array): void {
    if (consumer) {
      consumer(pcm)
      return
    }
    preroll.push(pcm)
    prerollSamples += pcm.length
    while (preroll.length > 1 && prerollSamples - preroll[0]!.length >= maxPrerollSamples) {
      prerollSamples -= preroll.shift()!.length
    }
  }

  async function ensureCapture(): Promise<void> {
    if (!desired || capture || starting) return
    starting = true
    try {
      const next = await startMicCapture({ onFrame, onError: options.onError })
      if (!desired) {
        next.stop()
        return
      }
      capture = next
    } catch (error) {
      options.onError?.(error instanceof Error ? error : new Error(String(error)))
    } finally {
      starting = false
    }
  }

  return {
    warm() {
      desired = true
      void ensureCapture()
    },
    consume(next) {
      consumer = next
      const buffered = preroll
      preroll = []
      prerollSamples = 0
      for (const frame of buffered) next(frame)
    },
    release() {
      desired = false
      capture?.stop()
      capture = null
      consumer = null
      preroll = []
      prerollSamples = 0
    },
  }
}
