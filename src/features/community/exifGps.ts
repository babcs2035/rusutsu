export function parseExifGpsJpeg(buffer: ArrayBuffer): [number, number] | null {
  const data = new DataView(buffer);
  const has = (offset: number, size: number) =>
    offset >= 0 && size >= 0 && offset + size <= data.byteLength;
  if (!has(0, 2) || data.getUint16(0) !== 0xffd8) return null;

  let offset = 2;
  let tiff = -1;
  while (has(offset, 4)) {
    if (data.getUint8(offset) !== 0xff) return null;
    const marker = data.getUint8(offset + 1);
    const length = data.getUint16(offset + 2);
    if (length < 2 || !has(offset + 2, length)) return null;
    if (
      marker === 0xe1 &&
      length >= 8 &&
      has(offset + 4, 6) &&
      data.getUint32(offset + 4) === 0x45786966 &&
      data.getUint16(offset + 8) === 0
    ) {
      tiff = offset + 10;
      break;
    }
    offset += 2 + length;
  }
  if (tiff < 0 || !has(tiff, 8)) return null;

  const byteOrder = data.getUint16(tiff);
  if (byteOrder !== 0x4949 && byteOrder !== 0x4d4d) return null;
  const little = byteOrder === 0x4949;
  const read16 = (at: number) =>
    has(at, 2) ? data.getUint16(at, little) : null;
  const read32 = (at: number) =>
    has(at, 4) ? data.getUint32(at, little) : null;
  if (read16(tiff + 2) !== 42) return null;
  const firstIfdOffset = read32(tiff + 4);
  if (firstIfdOffset == null) return null;
  const firstIfd = tiff + firstIfdOffset;
  const firstCount = read16(firstIfd);
  if (firstCount == null || !has(firstIfd + 2, firstCount * 12)) return null;

  let gpsIfdOffset: number | null = null;
  for (let index = 0; index < firstCount; index++) {
    const entry = firstIfd + 2 + index * 12;
    if (read16(entry) === 0x8825) gpsIfdOffset = read32(entry + 8);
  }
  if (gpsIfdOffset == null) return null;
  const gpsIfd = tiff + gpsIfdOffset;
  const gpsCount = read16(gpsIfd);
  if (gpsCount == null || !has(gpsIfd + 2, gpsCount * 12)) return null;
  const entries = new Map<number, number>();
  for (let index = 0; index < gpsCount; index++) {
    const entry = gpsIfd + 2 + index * 12;
    const tag = read16(entry);
    if (tag != null) entries.set(tag, entry);
  }

  const gpsReference = (tag: number, positive: string, negative: string) => {
    const entry = entries.get(tag);
    if (entry == null) return null;
    const type = read16(entry + 2);
    const count = read32(entry + 4);
    if (type !== 2 || count == null || count < 1) return null;
    const character = data.getUint8(entry + 8);
    return character === positive.charCodeAt(0)
      ? 1
      : character === negative.charCodeAt(0)
        ? -1
        : null;
  };
  const coordinates = (tag: number) => {
    const entry = entries.get(tag);
    if (entry == null || read16(entry + 2) !== 5 || read32(entry + 4) !== 3)
      return null;
    const valueOffset = read32(entry + 8);
    if (valueOffset == null) return null;
    const base = tiff + valueOffset;
    if (!has(base, 24)) return null;
    const values: number[] = [];
    for (let index = 0; index < 3; index++) {
      const numerator = read32(base + index * 8);
      const denominator = read32(base + index * 8 + 4);
      if (numerator == null || denominator == null || denominator === 0)
        return null;
      values.push(numerator / denominator);
    }
    return values;
  };

  const latitude = coordinates(2);
  const longitude = coordinates(4);
  const latitudeRef = gpsReference(1, "N", "S");
  const longitudeRef = gpsReference(3, "E", "W");
  if (!latitude || !longitude || latitudeRef == null || longitudeRef == null)
    return null;
  const lat =
    latitudeRef * (latitude[0] + latitude[1] / 60 + latitude[2] / 3600);
  const lng =
    longitudeRef * (longitude[0] + longitude[1] / 60 + longitude[2] / 3600);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  )
    return null;
  return [lng, lat];
}
