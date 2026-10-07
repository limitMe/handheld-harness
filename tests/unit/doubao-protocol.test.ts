import { gunzipSync, gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  COMPRESSION,
  FLAGS,
  MESSAGE_TYPE,
  SERIALIZATION,
  decodeServerMessage,
  encodeAudioRequest,
  encodeFullClientRequest,
  encodeHeader,
} from '../../src/main/speech/doubao-protocol'
import { extractSegments } from '../../src/main/speech/doubao'

function serverFrame(json: unknown, sequence?: number): Buffer {
  const body = gzipSync(Buffer.from(JSON.stringify(json), 'utf8'))
  const header = encodeHeader(
    MESSAGE_TYPE.fullServerResponse,
    sequence === undefined ? FLAGS.none : FLAGS.sequence,
    SERIALIZATION.json,
    COMPRESSION.gzip,
  )
  const size = Buffer.alloc(4)
  size.writeUInt32BE(body.length, 0)
  const seq = Buffer.alloc(sequence === undefined ? 0 : 4)
  if (sequence !== undefined) seq.writeInt32BE(sequence, 0)
  return Buffer.concat([header, seq, size, body])
}

describe('doubao binary protocol', () => {
  it('encodes a gzipped JSON full client request with a sequence number', () => {
    const payload = { audio: { format: 'pcm' }, request: { model_name: 'bigmodel' } }
    const buffer = encodeFullClientRequest(payload)

    expect(buffer[0]).toBe(0x11)
    expect(buffer[1]! >> 4).toBe(MESSAGE_TYPE.fullClientRequest)
    expect(buffer[1]! & 0x0f).toBe(FLAGS.sequence)
    expect(buffer[2]! >> 4).toBe(SERIALIZATION.json)
    expect(buffer[2]! & 0x0f).toBe(COMPRESSION.gzip)
    expect(buffer.readInt32BE(4)).toBe(1)

    const size = buffer.readUInt32BE(8)
    const body = buffer.subarray(12)
    expect(size).toBe(body.length)
    expect(JSON.parse(gunzipSync(body).toString('utf8'))).toEqual(payload)
  })

  it('marks the last audio packet and round-trips the PCM bytes', () => {
    const pcm = Buffer.from([1, 2, 3, 4, 5, 6])
    const normal = encodeAudioRequest(pcm, false)
    const last = encodeAudioRequest(pcm, true)

    expect(normal[1]! >> 4).toBe(MESSAGE_TYPE.audioOnlyRequest)
    expect(normal[1]! & 0x0f).toBe(FLAGS.none)
    expect(last[1]! & 0x0f).toBe(FLAGS.lastPacket)

    const size = normal.readUInt32BE(4)
    const body = normal.subarray(8)
    expect(size).toBe(body.length)
    expect(gunzipSync(body)).toEqual(pcm)
  })

  it('decodes a full server response without a sequence number', () => {
    const json = { code: 0, result: { text: '你好' } }
    const decoded = decodeServerMessage(serverFrame(json))

    expect(decoded.messageType).toBe(MESSAGE_TYPE.fullServerResponse)
    expect(decoded.sequence).toBeUndefined()
    expect(decoded.json).toEqual(json)
  })

  it('decodes a full server response carrying a sequence number', () => {
    const decoded = decodeServerMessage(serverFrame({ code: 0 }, 3))
    expect(decoded.sequence).toBe(3)
    expect(decoded.json).toEqual({ code: 0 })
  })

  it('decodes an error response message', () => {
    const frame = Buffer.concat([
      encodeHeader(MESSAGE_TYPE.errorResponse, FLAGS.none, SERIALIZATION.none, COMPRESSION.none),
      Buffer.from('invalid request', 'utf8'),
    ])
    const decoded = decodeServerMessage(frame)
    expect(decoded.messageType).toBe(MESSAGE_TYPE.errorResponse)
    expect(decoded.errorMessage).toBe('invalid request')
  })
})

describe('doubao response segments', () => {
  it('splits definite utterances from the in-progress one', () => {
    const segments = extractSegments({
      payload_msg: {
        result: {
          utterances: [
            { text: '你好', definite: true },
            { text: '世界', definite: false },
          ],
        },
      },
    })
    expect(segments).toEqual({ final: '你好', partial: '世界' })
  })

  it('falls back to whole text when no utterances are present', () => {
    expect(extractSegments({ result: { text: 'hello' } })).toEqual({ final: '', partial: 'hello' })
    expect(extractSegments(undefined)).toEqual({ final: '', partial: '' })
  })
})
