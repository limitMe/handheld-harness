import { describe, expect, it } from 'vitest'
import type { SpeechEvent } from '../../src/shared/speech'
import type { DictationAudio } from '../../src/renderer/src/dictation/audio'
import { DictationController } from '../../src/renderer/src/dictation/controller'
import type { DictationTarget } from '../../src/renderer/src/dictation/target'

function createTarget(value: string, selectionStart: number, selectionEnd: number) {
  const state = { value, start: selectionStart, end: selectionEnd, activated: true, alive: true }
  const target: DictationTarget = {
    getValue: () => state.value,
    getSelection: () => ({ start: state.start, end: state.end }),
    apply: (result) => {
      state.value = result.value
      state.start = result.selectionStart
      state.end = result.selectionEnd
    },
    activate: () => {
      state.activated = true
    },
    isActivated: () => state.activated,
    isAlive: () => state.alive,
  }
  return { target, state }
}

function createSpeech() {
  const listeners = new Set<(event: SpeechEvent) => void>()
  let startedId = ''
  let stopped: string | null = null
  let cancelled: string | null = null
  const bridge = {
    start: async () => {
      startedId = `s${Math.random().toString(36).slice(2, 8)}`
      return { sessionId: startedId }
    },
    pushAudio: async () => undefined,
    stop: async (id: string) => {
      stopped = id
    },
    cancel: async (id: string) => {
      cancelled = id
    },
    onEvent: (listener: (event: SpeechEvent) => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
  return {
    bridge,
    emit: (event: SpeechEvent) => {
      for (const listener of listeners) listener(event)
    },
    id: () => startedId,
    stopped: () => stopped,
    cancelled: () => cancelled,
  }
}

function createAudio() {
  let consumer: ((pcm: Int16Array) => void) | null = null
  const audio: DictationAudio = {
    warm: () => undefined,
    consume: (next) => {
      consumer = next
    },
    release: () => {
      consumer = null
    },
  }
  return { audio, push: (pcm: Int16Array) => consumer?.(pcm) }
}

function setup(target: DictationTarget | null) {
  const speech = createSpeech()
  const audio = createAudio()
  const statuses: string[] = []
  const errors: (string | null)[] = []
  const controller = new DictationController({
    speech: () => speech.bridge,
    audio: audio.audio,
    setStatus: (status) => statuses.push(status),
    setLevel: () => undefined,
    setError: (error) => errors.push(error),
  })
  const off = controller.connect()
  controller.registerTarget(target)
  return { controller, speech, audio, statuses, errors, off }
}

describe('DictationController', () => {
  it('ignores long-press when no target is registered (P-05)', async () => {
    const h = setup(null)
    await h.controller.start()
    expect(h.controller.active).toBe(false)
    expect(h.statuses).toEqual([])
    h.off()
  })

  it('starts a session, deletes the selection and previews partials', async () => {
    const { target, state } = createTarget('abcXYZdef', 3, 6)
    const h = setup(target)

    await h.controller.start()
    expect(h.statuses).toEqual(['starting', 'listening'])
    expect(state.value).toBe('abcdef')

    h.speech.emit({ type: 'partial', sessionId: h.speech.id(), text: '你好' })
    expect(state.value).toBe('abc你好def')
    expect({ start: state.start, end: state.end }).toEqual({ start: 3, end: 5 })

    h.speech.emit({ type: 'final', sessionId: h.speech.id(), text: '你好' })
    expect(state.value).toBe('abc你好def')
    expect({ start: state.start, end: state.end }).toEqual({ start: 5, end: 5 })
    h.off()
  })

  it('rolls the inserted text back on cancel', async () => {
    const { target, state } = createTarget('abcXYZdef', 3, 6)
    const h = setup(target)

    await h.controller.start()
    h.speech.emit({ type: 'partial', sessionId: h.speech.id(), text: '你好' })
    h.controller.cancel()

    expect(state.value).toBe('abcXYZdef')
    expect({ start: state.start, end: state.end }).toEqual({ start: 3, end: 6 })
    expect(h.controller.active).toBe(false)
    h.off()
  })

  it('ends the session when the caret moves away', async () => {
    const { target, state } = createTarget('', 0, 0)
    const h = setup(target)

    await h.controller.start()
    h.speech.emit({ type: 'partial', sessionId: h.speech.id(), text: '你好' })

    state.start = 0
    state.end = 0
    h.speech.emit({ type: 'final', sessionId: h.speech.id(), text: 'ignored' })

    expect(state.value).toBe('你好')
    expect(h.controller.active).toBe(false)
    expect(h.statuses.at(-1)).toBe('idle')
    h.off()
  })

  it('settles on stop and releases the microphone', async () => {
    const { target } = createTarget('', 0, 0)
    const h = setup(target)

    await h.controller.start()
    await h.controller.stop()
    expect(h.speech.stopped()).toBe(h.speech.id())

    h.speech.emit({ type: 'ended', sessionId: h.speech.id() })
    expect(h.controller.active).toBe(false)
    expect(h.statuses.at(-1)).toBe('idle')
    h.off()
  })
})
