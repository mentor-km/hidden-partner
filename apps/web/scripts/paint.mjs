import { deflateSync } from "node:zlib"
import { writeFileSync } from "node:fs"

const felt = [14, 59, 46]
const gold = [240, 212, 138]
const cream = [246, 240, 228]

const FONT = {
  H: ["10001", "10001", "11111", "10001", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
}

function png(width, height, pixel) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1)
    raw[row] = 0
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = pixel(x, y)
      const i = row + 1 + x * 4
      raw[i] = r
      raw[i + 1] = g
      raw[i + 2] = b
      raw[i + 3] = 255
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data])
    const out = Buffer.alloc(12 + data.length)
    out.writeUInt32BE(data.length, 0)
    body.copy(out, 4)
    out.writeUInt32BE(crc(body), 8 + data.length)
    return out
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

function crc(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) {
    c ^= byte
    for (let bit = 0; bit < 8; bit += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  return (c ^ 0xffffffff) >>> 0
}

function text(image, set, message, left, top, scale, color) {
  let x = left
  for (const char of message) {
    const rows = FONT[char] ?? FONT[" "]
    rows.forEach((row, y) => {
      ;[...row].forEach((bit, dx) => {
        if (bit !== "1") return
        for (let sy = 0; sy < scale; sy += 1) {
          for (let sx = 0; sx < scale; sx += 1) set(x + dx * scale + sx, top + y * scale + sy, color)
        }
      })
    })
    x += 6 * scale
  }
}

function paint(width, height, draw) {
  const pixels = new Uint8Array(width * height * 3)
  const set = (x, y, color) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const i = (y * width + x) * 3
    pixels[i] = color[0]
    pixels[i + 1] = color[1]
    pixels[i + 2] = color[2]
  }
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) set(x, y, felt)
  draw(set)
  return png(width, height, (x, y) => {
    const i = (y * width + x) * 3
    return [pixels[i], pixels[i + 1], pixels[i + 2]]
  })
}

function card(set, x, y, w, h) {
  for (let py = y; py < y + h; py += 1) {
    for (let px = x; px < x + w; px += 1) set(px, py, px === x || py === y || px === x + w - 1 || py === y + h - 1 ? gold : cream)
  }
}

const og = paint(1200, 630, (set) => {
  for (let i = 40; i < 1160; i += 1) {
    set(i, 36, gold)
    set(i, 594, gold)
  }
  for (let i = 36; i < 594; i += 1) {
    set(40, i, gold)
    set(1160, i, gold)
  }
  card(set, 150, 210, 110, 150)
  card(set, 290, 190, 110, 150)
  card(set, 430, 210, 110, 150)
  text(set, set, "HIDDEN PARTNER", 150, 420, 8, gold)
  text(set, set, "FIVE TO NINE FRIENDS", 150, 500, 4, cream)
})

function icon(size) {
  return paint(size, size, (set) => {
    const margin = Math.round(size * 0.22)
    card(set, margin, margin, size - margin * 2, size - margin * 2)
  })
}

writeFileSync(new URL("../public/og.png", import.meta.url), og)
writeFileSync(new URL("../public/icon-192.png", import.meta.url), icon(192))
writeFileSync(new URL("../public/icon-512.png", import.meta.url), icon(512))
