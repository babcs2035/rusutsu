export const MAX_SKIZ_BYTES = 20 * 1024 * 1024;
export const MAX_SKIZ_UNCOMPRESSED_BYTES = 80 * 1024 * 1024;

export class SkizFormatError extends Error {
  constructor(message = "SkiTracksファイルの形式が不正か、未対応です。") {
    super(message);
    this.name = "SkizFormatError";
  }
}

export type SkizZipEntry = {
  method: 0 | 8;
  expectedCrc: number;
  compressedSize: number;
  uncompressedSize: number;
  compressedData: Uint8Array;
};

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let value = n;
    for (let k = 0; k < 8; k++)
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[n] = value >>> 0;
  }
  return table;
})();

export function skizCrc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function verifySkizEntry(
  entry: SkizZipEntry,
  data: Uint8Array,
): Uint8Array {
  if (
    data.byteLength !== entry.uncompressedSize ||
    skizCrc32(data) !== entry.expectedCrc
  )
    throw new SkizFormatError("ZIP entry failed integrity checks.");
  return data;
}

export function parseSkizArchive(input: Uint8Array): Map<string, SkizZipEntry> {
  if (input.byteLength > MAX_SKIZ_BYTES)
    throw new SkizFormatError("File is too large.");
  if (input.byteLength < 22) throw new SkizFormatError();
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const read16 = (offset: number) => view.getUint16(offset, true);
  const read32 = (offset: number) => view.getUint32(offset, true);

  const minOffset = Math.max(0, input.byteLength - 22 - 0xffff);
  let eocd = -1;
  for (let at = input.byteLength - 22; at >= minOffset; at--) {
    if (read32(at) === 0x06054b50) {
      const commentLength = read16(at + 20);
      if (at + 22 + commentLength === input.byteLength) {
        eocd = at;
        break;
      }
    }
  }
  if (eocd < 0) throw new SkizFormatError();
  const disk = read16(eocd + 4);
  const centralDisk = read16(eocd + 6);
  const diskEntries = read16(eocd + 8);
  const totalEntries = read16(eocd + 10);
  const centralSize = read32(eocd + 12);
  const centralOffset = read32(eocd + 16);
  if (
    disk !== 0 ||
    centralDisk !== 0 ||
    diskEntries !== totalEntries ||
    totalEntries === 0xffff ||
    centralSize === 0xffffffff ||
    centralOffset === 0xffffffff ||
    centralOffset + centralSize > eocd
  )
    throw new SkizFormatError("Multi-part and ZIP64 archives are unsupported.");

  const files = new Map<string, SkizZipEntry>();
  let cursor = centralOffset;
  let uncompressedTotal = 0;
  for (let index = 0; index < totalEntries; index++) {
    if (
      cursor + 46 > centralOffset + centralSize ||
      read32(cursor) !== 0x02014b50
    )
      throw new SkizFormatError();
    const flags = read16(cursor + 8);
    const methodValue = read16(cursor + 10);
    const expectedCrc = read32(cursor + 16);
    const compressedSize = read32(cursor + 20);
    const uncompressedSize = read32(cursor + 24);
    const nameLength = read16(cursor + 28);
    const extraLength = read16(cursor + 30);
    const commentLength = read16(cursor + 32);
    const entryDisk = read16(cursor + 34);
    const localOffset = read32(cursor + 42);
    const entryEnd = cursor + 46 + nameLength + extraLength + commentLength;
    if (entryEnd > centralOffset + centralSize || entryDisk !== 0)
      throw new SkizFormatError();
    let name: string;
    try {
      name = new TextDecoder("utf-8", { fatal: true }).decode(
        input.subarray(cursor + 46, cursor + 46 + nameLength),
      );
    } catch {
      throw new SkizFormatError();
    }
    if (files.has(name))
      throw new SkizFormatError("ZIP contains duplicate entries.");
    if ((flags & 1) !== 0)
      throw new SkizFormatError("Encrypted ZIP files are unsupported.");
    if ((flags & 0x40) !== 0)
      throw new SkizFormatError("Strong encryption is unsupported.");
    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localOffset === 0xffffffff
    )
      throw new SkizFormatError("ZIP64 archives are unsupported.");
    if (uncompressedSize > MAX_SKIZ_UNCOMPRESSED_BYTES)
      throw new SkizFormatError("ZIP contents are too large.");
    uncompressedTotal += uncompressedSize;
    if (uncompressedTotal > MAX_SKIZ_UNCOMPRESSED_BYTES)
      throw new SkizFormatError("ZIP contents are too large.");
    if (methodValue !== 0 && methodValue !== 8)
      throw new SkizFormatError("ZIP compression method is unsupported.");
    if (
      localOffset + 30 > input.byteLength ||
      read32(localOffset) !== 0x04034b50
    )
      throw new SkizFormatError();
    const localNameLength = read16(localOffset + 26);
    const localExtraLength = read16(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > centralOffset || dataEnd > input.byteLength)
      throw new SkizFormatError();
    if (methodValue === 0 && compressedSize !== uncompressedSize)
      throw new SkizFormatError();
    files.set(name, {
      method: methodValue,
      expectedCrc,
      compressedSize,
      uncompressedSize,
      compressedData: input.subarray(dataStart, dataEnd),
    });
    cursor = entryEnd;
  }
  if (cursor !== centralOffset + centralSize) throw new SkizFormatError();
  return files;
}
