import { describe, expect, it } from 'vitest'
import { SPEECH_SAMPLE_RATE } from '../../src/shared/speech'
import {
  buildFunAsrRunTask,
  funAsrLanguageHint,
  readFunAsrResult,
} from '../../src/main/speech/funasr'

describe('Fun-ASR language hints', () => {
  it('omits the hint for auto detection', () => {
    expect(funAsrLanguageHint('auto')).toBeUndefined()
    expect(funAsrLanguageHint(undefined)).toBeUndefined()
  })

  it('maps regional tags onto ISO-639-1 codes', () => {
    expect(funAsrLanguageHint('zh-CN')).toBe('zh')
    expect(funAsrLanguageHint('en-US')).toBe('en')
  })
})

describe('Fun-ASR result events', () => {
  it('ignores heartbeats and the sentence-id-0 preamble', () => {
    expect(
      readFunAsrResult({ payload: { output: { sentence: { heartbeat: true, sentence_id: 0 } } } }),
    ).toEqual({ kind: 'ignore', text: '' })
    expect(
      readFunAsrResult({ payload: { output: { sentence: { sentence_id: 0, text: '' } } } }),
    ).toEqual({ kind: 'ignore', text: '' })
  })

  it('treats an unfinished sentence as a partial', () => {
    const result = readFunAsrResult({
      payload: { output: { sentence: { sentence_id: 1, sentence_end: false, text: '你好' } } },
    })
    expect(result).toEqual({ kind: 'partial', text: '你好' })
  })

  it('treats an ended sentence as final', () => {
    const result = readFunAsrResult({
      payload: { output: { sentence: { sentence_id: 1, sentence_end: true, text: '你好世界。' } } },
    })
    expect(result).toEqual({ kind: 'final', text: '你好世界。' })
  })
})

describe('Fun-ASR run-task payload', () => {
  const base = { language: 'auto', sampleRate: SPEECH_SAMPLE_RATE } as const

  it('builds a duplex recognition task with 16 kHz PCM', () => {
    const payload = buildFunAsrRunTask('task-1', 'fun-asr-realtime', { ...base }) as {
      header: Record<string, unknown>
      payload: {
        model: string
        parameters: Record<string, unknown>
        input: Record<string, unknown>
      }
    }
    expect(payload.header).toEqual({
      action: 'run-task',
      task_id: 'task-1',
      streaming: 'duplex',
    })
    expect(payload.payload.model).toBe('fun-asr-realtime')
    expect(payload.payload.parameters).toEqual({
      format: 'pcm',
      sample_rate: 16000,
      heartbeat: true,
    })
    expect(payload.payload.input).toEqual({})
  })

  it('passes a language hint only when not auto', () => {
    const payload = buildFunAsrRunTask('task-2', 'fun-asr-realtime', {
      ...base,
      language: 'zh-CN',
    }) as { payload: { parameters: Record<string, unknown> } }
    expect(payload.payload.parameters.language_hints).toEqual(['zh'])
  })

  it('sends hot words as context for models that support it', () => {
    const payload = buildFunAsrRunTask('task-3', 'fun-asr-realtime', {
      ...base,
      hints: ['Composer', 'DictationController'],
    }) as { payload: { input: { context?: Array<{ role: string; content: unknown }> } } }
    expect(payload.payload.input.context?.[0]?.role).toBe('user')
    expect(JSON.stringify(payload.payload.input.context)).toContain('Composer')
  })

  it('omits context for models that reject it', () => {
    const payload = buildFunAsrRunTask('task-4', 'fun-asr-flash-8k-realtime', {
      ...base,
      hints: ['Composer'],
    }) as { payload: { input: Record<string, unknown> } }
    expect(payload.payload.input).toEqual({})
  })
})
