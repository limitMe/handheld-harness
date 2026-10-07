import { randomUUID } from 'node:crypto'
import type { SpeechEvent, SpeechProvider, SpeechProviderInfo } from '../../shared/speech'

export interface MockSpeechEntry {
  type: 'partial' | 'final'
  text: string
}

export const MOCK_INFO: SpeechProviderInfo = {
  id: 'mock',
  displayName: 'Mock (test only)',
  streaming: true,
  languages: ['auto'],
  offline: true,
  requiresCredentials: false,
}

/**
 * Replays a scripted partial/final sequence for unit and e2e tests (spec 16).
 * It is never registered as a user-selectable provider.
 */
export function createMockSpeechProvider(
  emit: (event: SpeechEvent) => void,
  script: MockSpeechEntry[] = [],
): SpeechProvider {
  let queue = [...script]
  let sessionId: string | undefined

  return {
    info: () => MOCK_INFO,

    start(): Promise<string> {
      sessionId = randomUUID()
      emit({ type: 'started', sessionId })
      return Promise.resolve(sessionId)
    },

    pushAudio(id: string): void {
      if (id !== sessionId) return
      while (queue[0]?.type === 'partial') {
        const entry = queue.shift()!
        emit({ type: 'partial', sessionId: id, text: entry.text })
      }
    },

    stop(id: string): Promise<void> {
      if (id !== sessionId) return Promise.resolve()
      sessionId = undefined
      for (const entry of queue) {
        emit(
          entry.type === 'partial'
            ? { type: 'partial', sessionId: id, text: entry.text }
            : { type: 'final', sessionId: id, text: entry.text },
        )
      }
      queue = []
      emit({ type: 'ended', sessionId: id })
      return Promise.resolve()
    },

    cancel(id: string): void {
      if (id !== sessionId) return
      sessionId = undefined
      queue = []
      emit({ type: 'ended', sessionId: id })
    },
  }
}
