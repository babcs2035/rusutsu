import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import {
  extractExifGps,
  extractPhotoTakenOn,
  extractPhotoTakenOnFromExifValues,
  readPhotoGps,
  readPhotoMetadata,
} from "./photoGps";

function jpegWithGps({
  littleEndian = true,
  latitudeRef = "N",
  longitudeRef = "E",
  zeroDenominator = false,
}: {
  littleEndian?: boolean;
  latitudeRef?: "N" | "S";
  longitudeRef?: "E" | "W";
  zeroDenominator?: boolean;
} = {}) {
  const tiffLength = 140;
  const buffer = new ArrayBuffer(12 + tiffLength);
  const data = new DataView(buffer);
  const u16 = (at: number, value: number, little = littleEndian) =>
    data.setUint16(at, value, little);
  const u32 = (at: number, value: number, little = littleEndian) =>
    data.setUint32(at, value, little);
  data.setUint8(0, 0xff);
  data.setUint8(1, 0xd8);
  data.setUint8(2, 0xff);
  data.setUint8(3, 0xe1);
  data.setUint16(4, 8 + tiffLength, false);
  data.setUint32(6, 0x45786966);
  data.setUint16(10, 0, false);
  data.setUint8(12, littleEndian ? 0x49 : 0x4d);
  data.setUint8(13, littleEndian ? 0x49 : 0x4d);
  u16(14, 42);
  u32(16, 8);
  u16(20, 1);
  u16(22, 0x8825);
  u16(24, 4);
  u32(26, 1);
  u32(30, 26);
  u32(34, 0);
  u16(38, 4);
  u16(40, 1);
  u16(42, 2);
  u32(44, 2);
  data.setUint8(48, latitudeRef.charCodeAt(0));
  u16(52, 2);
  u16(54, 5);
  u32(56, 3);
  u32(60, 92);
  u16(64, 3);
  u16(66, 2);
  u32(68, 2);
  data.setUint8(72, longitudeRef.charCodeAt(0));
  u16(76, 4);
  u16(78, 5);
  u32(80, 3);
  u32(84, 116);
  u32(88, 0);
  const rational = (at: number, value: number, denominator: number) => {
    u32(at, value);
    u32(at + 4, denominator);
  };
  rational(104, 43, 1);
  rational(112, 30, 1);
  rational(120, 15, 1);
  rational(128, 142, 1);
  rational(136, 20, zeroDenominator ? 0 : 1);
  rational(144, 10, 1);
  return buffer;
}

function jpegWithExifDates({
  littleEndian = true,
  original,
  digitized,
  originalType = 2,
  originalOffset,
  includeOffsetTag = false,
  shortenApp1BeforeDate = false,
}: {
  littleEndian?: boolean;
  original?: string;
  digitized?: string;
  originalType?: number;
  originalOffset?: number;
  includeOffsetTag?: boolean;
  shortenApp1BeforeDate?: boolean;
} = {}) {
  const dates = [
    ...(original === undefined
      ? []
      : [{ tag: 0x9003, text: original, type: originalType }]),
    ...(digitized === undefined
      ? []
      : [{ tag: 0x9004, text: digitized, type: 2 }]),
    ...(includeOffsetTag ? [{ tag: 0x9011, text: "+14:00", type: 2 }] : []),
  ];
  const exifIfdOffset = 26;
  const valuesOffset = exifIfdOffset + 2 + dates.length * 12 + 4;
  const tiffLength = valuesOffset + dates.length * 24;
  const buffer = new ArrayBuffer(12 + tiffLength);
  const data = new DataView(buffer);
  const tiff = 12;
  const write16 = (at: number, value: number, little = littleEndian) =>
    data.setUint16(at, value, little);
  const write32 = (at: number, value: number, little = littleEndian) =>
    data.setUint32(at, value, little);
  data.setUint8(0, 0xff);
  data.setUint8(1, 0xd8);
  data.setUint8(2, 0xff);
  data.setUint8(3, 0xe1);
  data.setUint16(4, 8 + tiffLength, false);
  data.setUint32(6, 0x45786966, false);
  data.setUint16(10, 0, false);
  data.setUint8(tiff, littleEndian ? 0x49 : 0x4d);
  data.setUint8(tiff + 1, littleEndian ? 0x49 : 0x4d);
  write16(tiff + 2, 42);
  write32(tiff + 4, 8);
  write16(tiff + 8, 1);
  write16(tiff + 10, 0x8769);
  write16(tiff + 12, 4);
  write32(tiff + 14, 1);
  write32(tiff + 18, exifIfdOffset);
  write32(tiff + 22, 0);
  write16(tiff + exifIfdOffset, dates.length);
  dates.forEach((date, index) => {
    const entry = tiff + exifIfdOffset + 2 + index * 12;
    const textBytes = new TextEncoder().encode(date.text);
    const valueOffset = valuesOffset + index * 24;
    write16(entry, date.tag);
    write16(entry + 2, date.type);
    write32(entry + 4, textBytes.length + 1);
    write32(
      entry + 8,
      date.tag === 0x9003 && originalOffset !== undefined
        ? originalOffset
        : valueOffset,
    );
    textBytes.forEach((byte, byteIndex) => {
      data.setUint8(tiff + valueOffset + byteIndex, byte);
    });
    data.setUint8(tiff + valueOffset + textBytes.length, 0);
  });
  write32(tiff + exifIfdOffset + 2 + dates.length * 12, 0);
  if (shortenApp1BeforeDate) data.setUint16(4, 8 + valuesOffset, false);
  return buffer;
}

test("extracts north/east coordinates from little-endian EXIF", () => {
  assert.deepEqual(extractExifGps(jpegWithGps()), {
    latitude: 43.50416666666667,
    longitude: 142.3361111111111,
  });
});

test("extracts south/west coordinates from big-endian EXIF", () => {
  assert.deepEqual(
    extractExifGps(
      jpegWithGps({
        littleEndian: false,
        latitudeRef: "S",
        longitudeRef: "W",
      }),
    ),
    { latitude: -43.50416666666667, longitude: -142.3361111111111 },
  );
});

test("returns null for absent, truncated, or malformed GPS metadata", () => {
  const valid = jpegWithGps();
  assert.equal(extractExifGps(new ArrayBuffer(0)), null);
  assert.equal(extractExifGps(valid.slice(0, 40)), null);
  assert.equal(
    extractExifGps(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer),
    null,
  );
  assert.equal(extractExifGps(jpegWithGps({ zeroDenominator: true })), null);
  assert.equal(extractExifGps(new ArrayBuffer(8 * 1024 * 1024 + 1)), null);
});

test("reads camera-local original date in both TIFF byte orders", () => {
  const date = "2024:02:29 23:59:59";
  assert.equal(
    extractPhotoTakenOn(jpegWithExifDates({ original: date })),
    "2024-02-29",
  );
  assert.equal(
    extractPhotoTakenOn(
      jpegWithExifDates({ original: date, littleEndian: false }),
    ),
    "2024-02-29",
  );
});

test("falls back to digitized date only when original tag is absent", () => {
  assert.equal(
    extractPhotoTakenOn(
      jpegWithExifDates({ digitized: "2023:12:31 23:59:59" }),
    ),
    "2023-12-31",
  );
  assert.equal(
    extractPhotoTakenOn(
      jpegWithExifDates({
        original: "2024:02:30 12:00:00",
        digitized: "2023:12:31 23:59:59",
      }),
    ),
    null,
  );
});

test("validates raw EXIF dates without UTC conversion", () => {
  assert.equal(
    extractPhotoTakenOnFromExifValues(
      "2024:05:06 07:08:09",
      "2023:12:31 23:59:59",
    ),
    "2024-05-06",
  );
  assert.equal(
    extractPhotoTakenOnFromExifValues(null, "2024:02:29 23:59:59"),
    "2024-02-29",
  );
  assert.equal(
    extractPhotoTakenOnFromExifValues(
      "2023:02:29 12:00:00",
      "2024:01:01 00:00:00",
    ),
    null,
  );
  assert.equal(
    extractPhotoTakenOnFromExifValues(new Date("2024-01-01"), null),
    null,
  );
});

test("ignores timezone offsets and rejects invalid date fields and TIFF offsets", () => {
  assert.equal(
    extractPhotoTakenOn(
      jpegWithExifDates({
        original: "2024:01:01 00:30:00",
        includeOffsetTag: true,
      }),
    ),
    "2024-01-01",
  );
  assert.equal(
    extractPhotoTakenOn(jpegWithExifDates({ original: "2023:02:29 12:00:00" })),
    null,
  );
  assert.equal(
    extractPhotoTakenOn(jpegWithExifDates({ original: "2999:01:01 12:00:00" })),
    null,
  );
  assert.equal(
    extractPhotoTakenOn(
      jpegWithExifDates({ original: "2024:01:01 12:00:00", originalType: 3 }),
    ),
    null,
  );
  assert.equal(
    extractPhotoTakenOn(
      jpegWithExifDates({
        original: "2024:01:01 12:00:00",
        originalOffset: 0xffff,
      }),
    ),
    null,
  );
  assert.equal(
    extractPhotoTakenOn(
      jpegWithExifDates({
        original: "2024:01:01 12:00:00",
        shortenApp1BeforeDate: true,
      }),
    ),
    null,
  );
  const valid = jpegWithExifDates({ original: "2024:01:01 12:00:00" });
  assert.equal(extractPhotoTakenOn(valid.slice(0, valid.byteLength - 5)), null);
  assert.equal(extractPhotoTakenOn(new ArrayBuffer(8 * 1024 * 1024 + 1)), null);
});

test("reads GPS and date from one local file read", async () => {
  const buffer = jpegWithExifDates({ original: "2024:05:06 07:08:09" });
  let reads = 0;
  const file = {
    size: buffer.byteLength,
    arrayBuffer: async () => {
      reads++;
      return buffer;
    },
  } as File;
  assert.deepEqual(await readPhotoMetadata(file), {
    gps: null,
    observedOn: "2024-05-06",
    observedTime: "07:08",
  });
  assert.equal(reads, 1);
  assert.equal(await readPhotoGps(file), null);
  assert.equal(reads, 2);
});

test("reads dates from a real parsed non-JPEG EXIF container", async () => {
  const png = await sharp({
    create: {
      width: 1,
      height: 1,
      channels: 3,
      background: "white",
    },
  })
    .withExif({
      IFD2: {
        DateTimeOriginal: "2024:05:06 07:08:09",
        CreateDate: "2023:12:31 23:59:59",
      },
    })
    .png()
    .toBuffer();
  const file = {
    size: png.byteLength,
    arrayBuffer: async () =>
      png.buffer.slice(
        png.byteOffset,
        png.byteOffset + png.byteLength,
      ) as ArrayBuffer,
  } as File;

  assert.deepEqual(await readPhotoMetadata(file), {
    gps: null,
    observedOn: "2024-05-06",
    observedTime: "07:08",
  });
});
