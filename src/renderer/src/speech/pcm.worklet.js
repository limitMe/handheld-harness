// AudioWorklet processor (spec 16). Plain JS because Vite emits this file as a
// standalone asset that `audioWorklet.addModule` loads as a module script.
class PcmProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0]
    if (channel) {
      const frame = new Int16Array(channel.length)
      for (let i = 0; i < channel.length; i += 1) {
        const sample = Math.max(-1, Math.min(1, channel[i]))
        frame[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
      }
      this.port.postMessage(frame, [frame.buffer])
    }
    return true
  }
}

registerProcessor('pcm-processor', PcmProcessor)
