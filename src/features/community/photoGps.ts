import { parse as parseExifMetadata } from "exifr";
import { parseExifGpsJpeg } from "./exifGps";

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

export type PhotoGps = { latitude: number; longitude: number };
export type PhotoMetadata = {
  gps: PhotoGps | null;
  observedOn: string | null;
  observedTime: string | null;
};
type PhotoTakenAt = { observedOn: string; observedTime: string };

const EXIF_ID = 0x45786966;
const EXIF_DATE_TIME_ORIGINAL = 0x9003;
const EXIF_DATE_TIME_DIGITIZED = 0x9004;

function exifTiffOffset(data: DataView) {
  const has = (offset: number, size: number) =>
    offset >= 0 && size >= 0 && offset + size <= data.byteLength;
  if (!has(0, 2) || data.getUint16(0) !== 0xffd8) return null;

  let offset = 2;
  while (has(offset, 2) && data.getUint8(offset) === 0xff) {
    while (has(offset, 2) && data.getUint8(offset) === 0xff) offset++;
    if (!has(offset, 1)) return null;
    const marker = data.getUint8(offset++);
    if (marker === 0xda || marker === 0xd9) return null;
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (!has(offset, 2)) return null;
    const length = data.getUint16(offset, false);
    if (length < 2 || !has(offset, length)) return null;
    const segmentStart = offset - 2;
    if (
      marker === 0xe1 &&
      length >= 8 &&
      has(offset + 2, 6) &&
      data.getUint32(offset + 2, false) === EXIF_ID &&
      data.getUint16(offset + 6, false) === 0
    )
      return { tiff: segmentStart + 10, end: offset + length };
    offset += length;
  }
  return null;
}

function validateExifDate(datetime: string): string | null {
  return validateExifDateTime(datetime)?.observedOn ?? null;
}

function validateExifDateTime(datetime: string): PhotoTakenAt | null {
  const match = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(
    datetime,
  );
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] =
    match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysByMonth = [
    31,
    leap ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysByMonth[month - 1] ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  )
    return null;
  const observedOn = `${yearText}-${monthText}-${dayText}`;
  const todayParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const todayInJapan: Record<string, string> = {};
  for (const part of todayParts) todayInJapan[part.type] = part.value;
  const today = `${todayInJapan.year}-${todayInJapan.month}-${todayInJapan.day}`;
  return observedOn <= today
    ? { observedOn, observedTime: `${hourText}:${minuteText}` }
    : null;
}

/** Validate raw EXIF capture-date tags without converting them to UTC. */
export function extractPhotoTakenOnFromExifValues(
  original: unknown,
  digitized: unknown,
): string | null {
  const value = original ?? digitized;
  return typeof value === "string" ? validateExifDate(value) : null;
}

function readExifDate(data: DataView, tiff: number): string | null {
  const datetime = readExifDateTimeText(data, tiff);
  return datetime == null ? null : validateExifDate(datetime);
}

function readExifDateTimeText(data: DataView, tiff: number): string | null {
  const has = (offset: number, size: number) =>
    offset >= 0 && size >= 0 && offset + size <= data.byteLength;
  if (!has(tiff, 8)) return null;
  const byteOrder = data.getUint16(tiff);
  if (byteOrder !== 0x4949 && byteOrder !== 0x4d4d) return null;
  const little = byteOrder === 0x4949;
  const read16 = (offset: number) =>
    has(offset, 2) ? data.getUint16(offset, little) : null;
  const read32 = (offset: number) =>
    has(offset, 4) ? data.getUint32(offset, little) : null;
  if (read16(tiff + 2) !== 42) return null;

  const firstIfdOffset = read32(tiff + 4);
  if (firstIfdOffset == null) return null;
  const firstIfd = tiff + firstIfdOffset;
  const firstCount = read16(firstIfd);
  if (firstCount == null || !has(firstIfd + 2, firstCount * 12 + 4))
    return null;
  let exifIfdOffset: number | null = null;
  for (let index = 0; index < firstCount; index++) {
    const entry = firstIfd + 2 + index * 12;
    if (read16(entry) !== 0x8769) continue;
    if (read16(entry + 2) !== 4 || read32(entry + 4) !== 1) return null;
    exifIfdOffset = read32(entry + 8);
  }
  if (exifIfdOffset == null) return null;
  const exifIfd = tiff + exifIfdOffset;
  const exifCount = read16(exifIfd);
  if (exifCount == null || !has(exifIfd + 2, exifCount * 12 + 4)) return null;

  const entries = new Map<number, number>();
  for (let index = 0; index < exifCount; index++) {
    const entry = exifIfd + 2 + index * 12;
    const tag = read16(entry);
    if (tag != null) entries.set(tag, entry);
  }
  const original = entries.get(EXIF_DATE_TIME_ORIGINAL);
  const dateEntry = original ?? entries.get(EXIF_DATE_TIME_DIGITIZED);
  if (dateEntry == null || read16(dateEntry + 2) !== 2) return null;
  const count = read32(dateEntry + 4);
  if (count == null || count < 19 || count > 32) return null;
  const valueOffset = read32(dateEntry + 8);
  if (valueOffset == null) return null;
  const value = tiff + valueOffset;
  if (!has(value, count)) return null;
  if (count > 19 && data.getUint8(value + 19) !== 0) return null;

  let datetime = "";
  for (let index = 0; index < 19; index++) {
    const character = data.getUint8(value + index);
    if (character < 0x20 || character > 0x7e) return null;
    datetime += String.fromCharCode(character);
  }
  return datetime;
}

function extractPhotoTakenAt(buffer: ArrayBuffer): PhotoTakenAt | null {
  if (buffer.byteLength > MAX_PHOTO_BYTES) return null;
  try {
    const data = new DataView(buffer);
    const exif = exifTiffOffset(data);
    const datetime =
      exif == null
        ? null
        : readExifDateTimeText(new DataView(buffer, 0, exif.end), exif.tiff);
    return datetime == null ? null : validateExifDateTime(datetime);
  } catch {
    return null;
  }
}

/** Extract camera-local capture date from EXIF, ignoring timezone offsets. */
export function extractPhotoTakenOn(buffer: ArrayBuffer): string | null {
  if (buffer.byteLength > MAX_PHOTO_BYTES) return null;
  try {
    const data = new DataView(buffer);
    const exif = exifTiffOffset(data);
    return exif == null
      ? null
      : readExifDate(new DataView(buffer, 0, exif.end), exif.tiff);
  } catch {
    return null;
  }
}

/** Extract GPS coordinates from a JPEG's EXIF metadata. */
export function extractExifGps(buffer: ArrayBuffer): PhotoGps | null {
  if (buffer.byteLength > MAX_PHOTO_BYTES) return null;

  try {
    const coordinates = parseExifGpsJpeg(buffer);
    if (!coordinates) return null;
    const [longitude, latitude] = coordinates;
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    ) {
      return null;
    }
    return { latitude, longitude };
  } catch {
    return null;
  }
}

/** Read GPS coordinates from a browser File without uploading or decoding it. */
export async function readPhotoGps(file: File): Promise<PhotoGps | null> {
  return (await readPhotoMetadata(file)).gps;
}

/** Read EXIF GPS and capture date from one local file read, before upload. */
export async function readPhotoMetadata(file: File): Promise<PhotoMetadata> {
  const empty = { gps: null, observedOn: null, observedTime: null };
  if (file.size > MAX_PHOTO_BYTES) return empty;
  try {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
    if (isJpeg) {
      const takenAt = extractPhotoTakenAt(buffer);
      return {
        gps: extractExifGps(buffer),
        observedOn: takenAt?.observedOn ?? null,
        observedTime: takenAt?.observedTime ?? null,
      };
    }

    // exifr reads HEIC/HEIF, AVIF, and PNG containers in addition to JPEG.
    // Parse once from the already-read local buffer; no metadata is uploaded.
    const metadata = await parseExifMetadata(buffer, {
      reviveValues: false,
      translateKeys: true,
    });
    const latitude = metadata?.latitude;
    const longitude = metadata?.longitude;
    const raw =
      metadata?.DateTimeOriginal ??
      metadata?.CreateDate ??
      metadata?.DateTimeDigitized;
    const takenAt = typeof raw === "string" ? validateExifDateTime(raw) : null;
    return {
      gps:
        typeof latitude === "number" &&
        typeof longitude === "number" &&
        Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        Math.abs(latitude) <= 90 &&
        Math.abs(longitude) <= 180
          ? { latitude, longitude }
          : null,
      observedOn: takenAt?.observedOn ?? null,
      observedTime: takenAt?.observedTime ?? null,
    };
  } catch {
    return empty;
  }
}
