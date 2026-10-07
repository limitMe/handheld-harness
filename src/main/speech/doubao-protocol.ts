import { gunzipSync, gzipSync } from 'node:zlib'

/**
 * Volcengine "openspeech" v3 binary framing, used by the Doubao streaming ASR
 * endpoint (spec 16). Every WebSocket frame is
 * `header | [sequence] | payload size | payload`, big-endian throughout.
 *
 *    byte 0   protocol version (4 bits) | header size value (4 bits, x4 bytes)
 *    byte 1   message type (4 bits) | message-specific flags (4 bits)
 *    byte 2   serialization (4 bits) | compression (4 bits)
 *    byte 3   reserved
 */
export const PROTOCOL_VERSION = 0b0001
export const HEADER_SIZE = 0b0001

export const MESSAGE_TYPE = {
  fullClientRequest: 0b0001,
  audioOnlyRequest: 0b0010,
  fullServerResponse: 0b1001,
  errorResponse: 0b1111,
} as const

export const FLAGS = {
  none: 0b0000,
  /** The 4 bytes after the header are a positive sequence number. */
  sequence: 0b0001,
  /** Last packet; the 4 bytes after the header are not a sequence number. */
  lastPacket: 0b0010,
} as const

export const SERIALIZATION = { none: 0b0000, json: 0b0001 } as const
export const COMPRESSION = { none: 0b0000, gzip: 0b0001 } as const

export function encodeHeader(
  messageType: number,
  flags: number,
  serialization: number,
  compression: number,
): Buffer {
  return Buffer.from([
    (PROTOCOL_VERSION << 4) | HEADER_SIZE,
    (messageType << 4) | flags,
    (serialization << 4) | compression,
    0b0000,
  ])
}

function u32be(value: number): Buffer {
  const buffer = Buffer.alloc(4)
  buffer.writeUInt32BE(value >>> 0, 0)
  return buffer
}

/** First frame of a session: gzip-compressed JSON with the audio and request config. */
export function encodeFullClientRequest(payload: unknown): Buffer {
  const body = gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'))
  const header = encodeHeader(
    MESSAGE_TYPE.fullClientRequest,
    FLAGS.sequence,
    SERIALIZATION.json,
    COMPRESSION.gzip,
  )
  const sequence = Buffer.alloc(4)
  sequence.writeInt32BE(1, 0)
  return Buffer.concat([header, sequence, u32be(body.length), body])
}

/** One gzip-compressed audio frame; `isLast` marks the final (negative) packet. */
export function encodeAudioRequest(pcm: Buffer, isLast: boolean): Buffer {
  const body = gzipSync(pcm)
  const header = encodeHeader(
    MESSAGE_TYPE.audioOnlyRequest,
    isLast ? FLAGS.lastPacket : FLAGS.none,
    SERIALIZATION.none,
    COMPRESSION.gzip,
  )
  return Buffer.concat([header, u32be(body.length), body])
}

export interface ServerMessage {
  messageType: number
  flags: number
  sequence?: number
  /** Parsed JSON payload; absent for non-JSON or empty frames. */
  json?: unknown
  /** Best-effort message for `errorResponse` frames. */
  errorMessage?: string
}

function toBuffer(data: ArrayBuffer | Uint8Array): Buffer {
  if (Buffer.isBuffer(data)) return data
  if (data instanceof Uint8Array) return Buffer.from(data.buffer, data.byteOffset, data.byteLength)
  return Buffer.from(data)
}

export function decodeServerMessage(input: ArrayBuffer | Uint8Array): ServerMessage {
  const data = toBuffer(input)
  if (data.length < 4) throw new Error('doubao: frame shorter than its header')
  const headerSize = (data[0]! & 0b1111) * 4
  const messageType = data[1]! >> 4
  const flags = data[1]! & 0b1111
  const serialization = data[2]! >> 4
  const compression = data[2]! & 0b1111

  let offset = headerSize
  let sequence: number | undefined
  if ((flags & FLAGS.sequence) !== 0 && data.length >= offset + 4) {
    sequence = data.readInt32BE(offset)
    offset += 4
  }

  if (messageType === MESSAGE_TYPE.errorResponse) {
    return { messageType, flags, ...(sequence !== undefined ? { sequence } : {}), errorMessage: data.subarray(offset).toString('utf8').trim() }
  }

  let payload: Buffer
  if (data.length >= offset + 4) {
    const size = data.readUInt32BE(offset)
    if (offset + 4 + size <= data.length) {
      payload = data.subarray(offset + 4, offset + 4 + size)
    } else {
      // Some server builds omit the size prefix; fall back to the raw remainder.
      payload = data.subarray(offset)
    }
  } else {
    payload = data.subarray(offset)
  }

  const raw =
    compression === COMPRESSION.gzip && payload.length > 0 ? gunzipSync(payload) : payload
  const message: ServerMessage = { messageType, flags }
  if (sequence !== undefined) message.sequence = sequence
  if (serialization === SERIALIZATION.json && raw.length > 0) {
    message.json = JSON.parse(raw.toString('utf8'))
  }
  return message
}
