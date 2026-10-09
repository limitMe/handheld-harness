import { describe, expect, it } from 'vitest'
import { resamplePcm16 } from '../../src/main/speech/resample'

describe('resamplePcm16', () => {
  it('returns the input unchanged when the rates match', () => {
    const input = new Int16Array([1, 2, 3])
    expect(resamplePcm16(input, 16000, 16000)).toBe(input)
  })

  it('upsamples 16 kHz to 24 kHz with linear interpolation', () => {
    const out = resamplePcm16(new Int16Array([0, 1000, 2000, 3000]), 16000, 24000)
    expect(out.length).toBe(6)
    expect([...out]).toEqual([0, 667, 1333, 2000, 2667, 3000])
  })

  it('downsamples 24 kHz to 16 kHz', () => {
    const out = resamplePcm16(new Int16Array([0, 1000, 2000, 3000, 4000, 5000]), 24000, 16000)
    expect(out.length).toBe(4)
    expect(out[0]).toBe(0)
    expect(out.at(-1)).toBe(4500)
  })

  it('keeps an empty frame empty', () => {
    expect(resamplePcm16(new Int16Array(0), 16000, 24000).length).toBe(0)
  })

  it('clamps interpolated values into the Int16 range', () => {
    const out = resamplePcm16(new Int16Array([32767, 32767, 32767]), 16000, 24000)
    expect([...out].every((value) => value >= -32768 && value <= 32767)).toBe(true)
  })
})
