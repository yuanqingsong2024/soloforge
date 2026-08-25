/**
 * 简单图标生成脚本 - 生成 SoloForge 应用图标
 * 使用纯 Node.js 生成最小 PNG
 */
import { writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { deflateSync } from 'zlib'

const __dirname = dirname(fileURLToPath(import.meta.url))

// CRC32 implementation for PNG
function crc32(data) {
  let crc = 0xFFFFFFFF
  const table = []

  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    }
    table[i] = c
  }

  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8)
  }

  return crc ^ 0xFFFFFFFF
}

function createChunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)

  const typeBuffer = Buffer.from(type)
  const crcData = Buffer.concat([typeBuffer, data])
  const crc = crc32(crcData)

  const crcBuffer = Buffer.alloc(4)
  crcBuffer.writeUInt32BE(crc >>> 0, 0)

  return Buffer.concat([length, typeBuffer, data, crcBuffer])
}

function createMinimalPng(width, height, r, g, b) {
  // PNG signature
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])

  // IHDR chunk
  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(width, 0)  // width
  ihdrData.writeUInt32BE(height, 4) // height
  ihdrData.writeUInt8(8, 8)        // bit depth
  ihdrData.writeUInt8(2, 9)        // color type (RGB)
  ihdrData.writeUInt8(0, 10)       // compression
  ihdrData.writeUInt8(0, 11)       // filter
  ihdrData.writeUInt8(0, 12)       // interlace
  const ihdrChunk = createChunk('IHDR', ihdrData)

  // IDAT chunk - raw image data
  const rawData = []
  for (let y = 0; y < height; y++) {
    rawData.push(0) // filter byte
    for (let x = 0; x < width; x++) {
      // Create a radial gradient for visual interest
      const centerX = width / 2
      const centerY = height / 2
      const dist = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2)
      const maxDist = Math.sqrt(centerX ** 2 + centerY ** 2)
      const factor = 1 - (dist / maxDist) * 0.4

      // SoloForge purple brand color
      rawData.push(Math.floor(r * factor))
      rawData.push(Math.floor(g * factor))
      rawData.push(Math.floor(b * factor))
    }
  }

  const compressed = deflateSync(Buffer.from(rawData))
  const idatChunk = createChunk('IDAT', compressed)

  // IEND chunk
  const iendChunk = createChunk('IEND', Buffer.alloc(0))

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk])
}

// Generate icon with SoloForge brand colors (purple #8A5CDC)
const png = createMinimalPng(256, 256, 138, 92, 220)

const outputPath = join(__dirname, '..', 'build', 'icon.png')
mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, png)
console.log(`Icon created: ${outputPath}`)
console.log('Note: For production, replace with a proper designed icon (1024x1024 for macOS)')
