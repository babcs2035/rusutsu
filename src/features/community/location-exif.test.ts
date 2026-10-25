import assert from "node:assert/strict";
import { test } from "node:test";
import { parseExifGpsJpeg } from "./exifGps";
import { nearestCourseId } from "./location";

function jpegWithGps({ zeroDenominator = false } = {}) {
  const tiffLength = 140;
  const buffer = new ArrayBuffer(12 + tiffLength);
  const data = new DataView(buffer);
  const u16 = (at: number, value: number) => data.setUint16(at, value, true);
  const u32 = (at: number, value: number) => data.setUint32(at, value, true);
  data.setUint8(0, 0xff);
  data.setUint8(1, 0xd8);
  data.setUint8(2, 0xff);
  data.setUint8(3, 0xe1);
  data.setUint16(4, 8 + tiffLength, false);
  data.setUint32(6, 0x45786966);
  u16(10, 0);
  data.setUint8(12, 0x49);
  data.setUint8(13, 0x49);
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
  data.setUint8(48, 78);
  u16(52, 2);
  u16(54, 5);
  u32(56, 3);
  u32(60, 92);
  u16(64, 3);
  u16(66, 2);
  u32(68, 2);
  data.setUint8(72, 69);
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

test("reads valid JPEG GPS coordinates", () => {
  const result = parseExifGpsJpeg(jpegWithGps());
  assert.ok(result);
  assert.ok(Math.abs(result[0] - 142.3361111) < 0.000001);
  assert.ok(Math.abs(result[1] - 43.5041667) < 0.000001);
});

test("returns null for malformed or missing GPS metadata", () => {
  assert.equal(parseExifGpsJpeg(new ArrayBuffer(1)), null);
  assert.equal(
    parseExifGpsJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer),
    null,
  );
  assert.equal(parseExifGpsJpeg(jpegWithGps({ zeroDenominator: true })), null);
  const invalidMarker = new Uint8Array(jpegWithGps());
  invalidMarker[3] = 0xff;
  assert.equal(parseExifGpsJpeg(invalidMarker.buffer), null);
});

test("nearest course does not connect separate geometry lines across a gap", () => {
  const courses = [
    {
      id: "split",
      coordinates: [
        [0, 0],
        [0.001, 0],
      ],
      lines: [
        [
          [0, 0],
          [0.001, 0],
        ],
        [
          [0.009, 0],
          [0.01, 0],
        ],
      ],
    },
    {
      id: "near",
      coordinates: [
        [0.004, 0.0001],
        [0.006, 0.0001],
      ],
      lines: [
        [
          [0.004, 0.0001],
          [0.006, 0.0001],
        ],
      ],
    },
  ];
  assert.equal(nearestCourseId([0.005, 0], courses), "near");
});

test("nearest course handles singleton lines and absent geometry", () => {
  assert.equal(
    nearestCourseId(
      [1, 1],
      [{ id: "point", coordinates: [[1.001, 1]], lines: [[[1.001, 1]]] }],
    ),
    "point",
  );
  assert.equal(
    nearestCourseId([1, 1], [{ id: "empty", coordinates: [], lines: [] }]),
    null,
  );
});
