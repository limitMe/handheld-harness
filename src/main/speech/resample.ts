/**
 * Linear PCM resampling for speech providers whose input rate differs from the
 * renderer's 16 kHz capture (spec 16). The OpenAI realtime transcription session
 * only accepts 24 kHz mono PCM, so its adapter upsamples 16 kHz → 24 kHz here.
 * Linear interpolation is plenty for band-limited voice.
 */
export function resamplePcm16(input: Int16Array, inRate: number, outRate: number): Int16Array {
  if (inRate === outRate || input.length === 0) return input
  const outLength = Math.max(1, Math.round((input.length * outRate) / inRate))
  const out = new Int16Array(outLength)
  const step = inRate / outRate
  const last = input.length - 1
  for (let i = 0; i < outLength; i += 1) {
    const position = i * step
    const low = Math.min(Math.floor(position), last)
    const high = Math.min(low + 1, last)
    const fraction = position - low
    const value = input[low]! + (input[high]! - input[low]!) * fraction
    out[i] = Math.max(-32768, Math.min(32767, Math.round(value)))
  }
  return out
}
