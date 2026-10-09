import { describe, expect, it } from 'vitest'
import { SPEECH_SAMPLE_RATE, type SpeechSessionOptions } from '../../src/shared/speech'
import {
  buildOpenAiSessionUpdate,
  openAiLanguageCode,
} from '../../src/main/speech/openai'

const base: SpeechSessionOptions = { language: 'auto', sampleRate: SPEECH_SAMPLE_RATE }

interface SessionUpdate {
  type: string
  session: {
    type: string
    audio: {
      input: {
        format: { type: string; rate: number }
        transcription: Record<string, unknown>
        turn_detection: unknown
      }
    }
  }
}

describe('OpenAI language codes', () => {
  it('omits the field for auto detection', () => {
    expect(openAiLanguageCode('auto')).toBeUndefined()
    expect(openAiLanguageCode(undefined)).toBeUndefined()
  })

  it('maps regional tags onto ISO-639-1 codes', () => {
    expect(openAiLanguageCode('zh-CN')).toBe('zh')
    expect(openAiLanguageCode('en-US')).toBe('en')
  })
})

describe('OpenAI transcription session config', () => {
  it('configures a 24 kHz transcription session with turn detection off', () => {
    const update = buildOpenAiSessionUpdate('gpt-live-transcribe', base) as SessionUpdate
    expect(update.type).toBe('session.update')
    expect(update.session.type).toBe('transcription')
    expect(update.session.audio.input.format).toEqual({ type: 'audio/pcm', rate: 24000 })
    expect(update.session.audio.input.transcription).toEqual({ model: 'gpt-live-transcribe' })
    expect(update.session.audio.input.turn_detection).toBeNull()
  })

  it('uses `languages` and `keywords` for the live/transcribe models', () => {
    const update = buildOpenAiSessionUpdate('gpt-live-transcribe', {
      ...base,
      language: 'zh-CN',
      hints: ['Composer', 'DictationController'],
    }) as SessionUpdate
    const transcription = update.session.audio.input.transcription
    expect(transcription.languages).toEqual(['zh'])
    expect(transcription.keywords).toEqual(['Composer', 'DictationController'])
    expect(transcription.language).toBeUndefined()
  })

  it('uses `language` and `prompt` for the 4o transcribe models', () => {
    const update = buildOpenAiSessionUpdate('gpt-4o-transcribe', {
      ...base,
      language: 'en-US',
      hints: ['Composer'],
    }) as SessionUpdate
    const transcription = update.session.audio.input.transcription
    expect(transcription.language).toBe('en')
    expect(transcription.prompt).toBe('Composer')
    expect(transcription.languages).toBeUndefined()
  })
})
