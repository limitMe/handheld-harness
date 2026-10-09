#!/usr/bin/env node
/**
 * Renders the Handheld Harness app icon into `resources/icons/`.
 *
 * Input is `resources/icons/source.png`: the 1:1 artboard as drawn, with the dark panel
 * (its command-line style edge strip on top and the "H3" mark) centred on a transparent
 * canvas. The transparency is part of the design, like the icons Windows ships for its
 * terminals, so the artboard is passed through untouched and only scaled per size. Each
 * size is written as a PNG plus, for the sizes Windows asks for, one multi-size `.ico` for
 * the shell surfaces (desktop shortcut, taskbar).
 *
 * Pure Node, so it runs on every platform without a native image dependency.
 *
 * Usage: npm run icons
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ASSET_DIR = path.join(ROOT, 'resources', 'icons')
const SOURCE_FILE = path.join(ASSET_DIR, 'source.png')
const ICO_FILE = path.join(ASSET_DIR, 'handheld-harness.ico')

/** Sizes written as standalone PNGs. `source.png` is the 1024 master. */
const PNG_SIZES = [16, 24, 32, 48, 64, 128, 256, 512]
/** Sizes packed into the .ico. 256 is the largest Windows shell asks for. */
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
/** Entries at least this large are stored as PNG, which keeps the .ico small. */
const PNG_ICO_ENTRY_SIZE = 256
/** Alpha below this counts as transparent when building an icon's AND mask. */
const OPAQUE_ALPHA = 128

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const chunk = Buffer.alloc(data.length + 12)
  chunk.writeUInt32BE(data.length, 0)
  chunk.write(type, 4, 'ascii')
  data.copy(chunk, 8)
  chunk.writeUInt32BE(crc32(chunk.subarray(4, data.length + 8)), data.length + 8)
  return chunk
}

function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

/** Standard per-row filter heuristic: keep the filter with the smallest absolute residuals. */
function filterRows(image) {
  const { width, height, data } = image
  const stride = width * 4
  const candidates = Array.from({ length: 5 }, () => new Uint8Array(stride))
  const previous = new Uint8Array(stride)
  const raw = Buffer.alloc((stride + 1) * height)

  for (let y = 0; y < height; y += 1) {
    const line = data.subarray(y * stride, (y + 1) * stride)
    let bestFilter = 0
    let bestScore = Infinity
    for (let filter = 0; filter < candidates.length; filter += 1) {
      const row = candidates[filter]
      let score = 0
      for (let i = 0; i < stride; i += 1) {
        const left = i >= 4 ? line[i - 4] : 0
        const up = previous[i]
        let value = line[i]
        if (filter === 1) value -= left
        else if (filter === 2) value -= up
        else if (filter === 3) value -= (left + up) >> 1
        else if (filter === 4) value -= paeth(left, up, i >= 4 ? previous[i - 4] : 0)
        value &= 0xff
        row[i] = value
        score += value < 128 ? value : 256 - value
      }
      if (score < bestScore) {
        bestScore = score
        bestFilter = filter
      }
    }
    const row = y * (stride + 1)
    raw[row] = bestFilter
    const chosen = candidates[bestFilter]
    Buffer.from(chosen.buffer, chosen.byteOffset, stride).copy(raw, row + 1)
    previous.set(line)
  }
  return raw
}

/** Encodes an 8-bit RGBA image (truecolour + alpha, no interlacing) as PNG. */
function encodePng(image) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(image.width, 0)
  header.writeUInt32BE(image.height, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // colour type: RGBA
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(filterRows(image), { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

/** Decodes an 8-bit non-interlaced PNG into RGBA. */
function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('not a PNG file')

  let header = null
  const idat = []
  let offset = 8
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12],
      }
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
    offset += length + 12
  }
  if (!header) throw new Error('PNG has no IHDR chunk')

  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[header.colorType]
  if (header.bitDepth !== 8 || !channels) {
    throw new Error(
      `unsupported PNG format (bit depth ${header.bitDepth}, colour type ${header.colorType})`,
    )
  }
  if (header.interlace !== 0) throw new Error('interlaced PNGs are not supported')

  const { width, height } = header
  const stride = width * channels
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const rows = Buffer.alloc(height * stride)

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride)
    const row = rows.subarray(y * stride, (y + 1) * stride)
    const previous = y > 0 ? rows.subarray((y - 1) * stride, y * stride) : null
    for (let i = 0; i < stride; i += 1) {
      const left = i >= channels ? row[i - channels] : 0
      const up = previous ? previous[i] : 0
      const upLeft = previous && i >= channels ? previous[i - channels] : 0
      let value = line[i]
      if (filter === 1) value += left
      else if (filter === 2) value += up
      else if (filter === 3) value += (left + up) >> 1
      else if (filter === 4) value += paeth(left, up, upLeft)
      else if (filter !== 0) throw new Error(`unsupported PNG filter ${filter}`)
      row[i] = value & 0xff
    }
  }

  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i += 1) {
    const p = i * channels
    const grayscale = channels <= 2
    data[i * 4] = rows[p]
    data[i * 4 + 1] = grayscale ? rows[p] : rows[p + 1]
    data[i * 4 + 2] = grayscale ? rows[p] : rows[p + 2]
    data[i * 4 + 3] = channels === 2 || channels === 4 ? rows[p + channels - 1] : 255
  }
  return { width, height, data }
}

/**
 * Area-average resampling: each destination pixel averages the source pixels it covers,
 * weighted by the covered area. Colours are averaged pre-multiplied by alpha and divided
 * back out afterwards, so transparent regions cannot bleed into the edges of the panel.
 */
function resize(image, width, height) {
  const data = new Uint8ClampedArray(width * height * 4)
  const scaleX = image.width / width
  const scaleY = image.height / height
  for (let y = 0; y < height; y += 1) {
    const top = y * scaleY
    const bottom = top + scaleY
    for (let x = 0; x < width; x += 1) {
      const left = x * scaleX
      const right = left + scaleX
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let weight = 0
      for (let sy = Math.floor(top); sy < Math.min(image.height, Math.ceil(bottom)); sy += 1) {
        const wy = Math.min(sy + 1, bottom) - Math.max(sy, top)
        if (wy <= 0) continue
        for (let sx = Math.floor(left); sx < Math.min(image.width, Math.ceil(right)); sx += 1) {
          const wx = Math.min(sx + 1, right) - Math.max(sx, left)
          if (wx <= 0) continue
          const w = wx * wy
          const i = (sy * image.width + sx) * 4
          const alpha = image.data[i + 3] / 255
          r += image.data[i] * alpha * w
          g += image.data[i + 1] * alpha * w
          b += image.data[i + 2] * alpha * w
          a += alpha * w
          weight += w
        }
      }
      const o = (y * width + x) * 4
      data[o] = a > 0 ? r / a : 0
      data[o + 1] = a > 0 ? g / a : 0
      data[o + 2] = a > 0 ? b / a : 0
      data[o + 3] = (a / weight) * 255
    }
  }
  return { width, height, data }
}

/**
 * Windows DIB entry: BITMAPINFOHEADER + bottom-up BGRA + 1bpp AND mask. Older icon
 * consumers (GDI+, .NET, the shell's `IconLocation`) do not read PNG entries, so the sizes
 * below 256 are packed this way to stay compatible; the mask marks transparent pixels for
 * the readers that ignore the alpha channel.
 */
function encodeDib({ width, height, data }) {
  const header = Buffer.alloc(40)
  header.writeUInt32LE(40, 0) // biSize
  header.writeInt32LE(width, 4)
  header.writeInt32LE(height * 2, 8) // biHeight covers the XOR bitmap and the AND mask
  header.writeUInt16LE(1, 12) // biPlanes
  header.writeUInt16LE(32, 14) // biBitCount
  header.writeUInt32LE(width * height * 4, 20) // biSizeImage

  const xor = Buffer.alloc(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    const source = (height - 1 - y) * width * 4
    for (let x = 0; x < width; x += 1) {
      const s = source + x * 4
      const o = (y * width + x) * 4
      xor[o] = data[s + 2] // blue
      xor[o + 1] = data[s + 1] // green
      xor[o + 2] = data[s] // red
      xor[o + 3] = data[s + 3] // alpha
    }
  }

  const maskStride = Math.ceil(width / 32) * 4
  const mask = Buffer.alloc(maskStride * height)
  for (let y = 0; y < height; y += 1) {
    const source = (height - 1 - y) * width * 4
    for (let x = 0; x < width; x += 1) {
      if (data[source + x * 4 + 3] >= OPAQUE_ALPHA) continue
      mask[y * maskStride + (x >> 3)] |= 0x80 >> (x & 7)
    }
  }

  return Buffer.concat([header, xor, mask])
}

/** Packs icon images into a Vista-style .ico, keeping the entries in ascending size order. */
function encodeIco(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(images.length, 4)

  const entries = []
  const blobs = []
  let offset = 6 + images.length * 16
  for (const { size, image } of images) {
    const payload = size >= PNG_ICO_ENTRY_SIZE ? encodePng(image) : encodeDib(image)
    const entry = Buffer.alloc(16)
    entry[0] = size >= 256 ? 0 : size // 0 stands for 256
    entry[1] = size >= 256 ? 0 : size
    entry.writeUInt16LE(1, 4) // colour planes
    entry.writeUInt16LE(32, 6) // bits per pixel
    entry.writeUInt32LE(payload.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += payload.length
    entries.push(entry)
    blobs.push(payload)
  }
  return Buffer.concat([header, ...entries, ...blobs])
}

function writeFile(file, contents) {
  fs.writeFileSync(file, contents)
  console.log(`wrote ${path.relative(ROOT, file).replace(/\\/g, '/')} (${contents.length} bytes)`)
}

function main() {
  if (!fs.existsSync(SOURCE_FILE)) throw new Error(`missing source image at ${SOURCE_FILE}`)
  const master = decodePng(fs.readFileSync(SOURCE_FILE))
  if (master.width !== master.height) {
    throw new Error(`source.png must be square (got ${master.width}x${master.height})`)
  }
  const render = (size) => (size === master.width ? master : resize(master, size, size))

  // Drop PNGs from an older size list, so the directory always mirrors this script.
  const expected = new Set(PNG_SIZES.map((size) => `icon-${size}.png`))
  for (const name of fs.readdirSync(ASSET_DIR)) {
    if (/^icon-\d+\.png$/.test(name) && !expected.has(name)) fs.rmSync(path.join(ASSET_DIR, name))
  }

  for (const size of PNG_SIZES) {
    writeFile(path.join(ASSET_DIR, `icon-${size}.png`), encodePng(render(size)))
  }
  writeFile(ICO_FILE, encodeIco(ICO_SIZES.map((size) => ({ size, image: render(size) }))))
}

try {
  main()
} catch (error) {
  console.error(`icons failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
