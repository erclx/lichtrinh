const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const HEADER = 6
const ENTRY = 16
// An icon entry holds its size in one byte, so 256 is the largest it names.
const LARGEST = 256

/**
 * One Windows `.ico` holding each PNG whole, which Windows reads since Vista,
 * so no image is decoded or scaled here.
 */
export function icoFromPngs(pngs: readonly Uint8Array[]): Buffer {
  const header = Buffer.alloc(HEADER)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(pngs.length, 4)

  let offset = HEADER + ENTRY * pngs.length
  const entries = pngs.map((png) => {
    const { width, height } = pngSize(png)
    const entry = Buffer.alloc(ENTRY)
    entry[0] = width % LARGEST
    entry[1] = height % LARGEST
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += png.length
    return entry
  })
  return Buffer.concat([header, ...entries, ...pngs])
}

/** The size a PNG's header states, which its first chunk always carries. */
function pngSize(png: Uint8Array): { width: number; height: number } {
  const bytes = Buffer.from(png.buffer, png.byteOffset, png.byteLength)
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error('an icon image is not a PNG')
  }
  const width = bytes.readUInt32BE(16)
  const height = bytes.readUInt32BE(20)
  if (width > LARGEST || height > LARGEST) {
    throw new Error(
      `an icon image is ${width} by ${height} px, past the ${LARGEST} an icon holds`,
    )
  }
  return { width, height }
}
