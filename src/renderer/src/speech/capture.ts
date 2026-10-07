import { SPEECH_SAMPLE_RATE } from '@shared/speech'
import workletUrl from './pcm.worklet.js?url&no-inline'

export interface MicCapture {
  stop(): void
}

export interface MicCaptureOptions {
  /** Pin a specific input device; omit for the system default. */
  deviceId?: string
  /** Frames are coalesced into chunks of roughly this duration (default 200 ms). */
  chunkMs?: number
  /** Receives 16 kHz mono PCM frames as they arrive. */
  onFrame(pcm: Int16Array): void
  onError?(error: Error): void
}

/**
 * Microphone capture pipeline (spec 16): `getUserMedia` feeds an AudioWorklet
 * that converts to 16 kHz mono Int16 in the audio thread. The worklet renders
 * 128-sample blocks, so they are coalesced into ~200 ms chunks before being
 * handed off, which matches the streaming provider's recommended packet size.
 */
export async function startMicCapture(options: MicCaptureOptions): Promise<MicCapture> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: options.deviceId ? { deviceId: { exact: options.deviceId } } : true,
  })
  const context = new AudioContext({ sampleRate: SPEECH_SAMPLE_RATE })
  try {
    await context.audioWorklet.addModule(workletUrl)
    const source = context.createMediaStreamSource(stream)
    const node = new AudioWorkletNode(context, 'pcm-processor')
    const targetSamples = Math.max(
      1,
      Math.round((SPEECH_SAMPLE_RATE * (options.chunkMs ?? 200)) / 1000),
    )
    let pending: Int16Array[] = []
    let pendingSamples = 0
    const flush = (): void => {
      if (pendingSamples === 0) return
      const merged = new Int16Array(pendingSamples)
      let offset = 0
      for (const frame of pending) {
        merged.set(frame, offset)
        offset += frame.length
      }
      pending = []
      pendingSamples = 0
      options.onFrame(merged)
    }
    node.onprocessorerror = () => options.onError?.(new Error('AudioWorklet processor failed'))
    node.port.onmessage = (event: MessageEvent<Int16Array>) => {
      pending.push(event.data)
      pendingSamples += event.data.length
      if (pendingSamples >= targetSamples) flush()
    }
    // A muted sink keeps the graph pulling audio without playing it back.
    const sink = context.createGain()
    sink.gain.value = 0
    source.connect(node)
    node.connect(sink)
    sink.connect(context.destination)
    return {
      stop() {
        node.port.onmessage = null
        flush()
        source.disconnect()
        node.disconnect()
        sink.disconnect()
        stream.getTracks().forEach((track) => track.stop())
        void context.close()
      },
    }
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop())
    void context.close()
    throw error
  }
}
