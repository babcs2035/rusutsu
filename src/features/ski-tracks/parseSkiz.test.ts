import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateRawSync } from "node:zlib";
import { MAX_SKIZ_BYTES, parseSkiz, SkizFormatError } from "./parseSkiz";

const sampleFiles = {
  "Track.xml":
    '<?xml version="1.0"?><track name="Sample" description="en:Demo;ja:テスト;" activity="skiing" start="2026-01-15T07:00:00+09:00" finish="2026-01-15T08:00:00+09:00" tz="+09:00" duration="3600"/>',
  "Nodes.csv":
    "1768430000.000,36.1,136.2,1000.5,180,2.5,4.7,1.2\n1768430001.250,36.2,136.3,1001,181,3,4.8,1.3\n",
  "Segment.csv":
    "4\n1768430000.000,1768430020.000,8,0,1,Ski Run 1,,ski_run,,,,20.000,5.2,100.0,-30.0,6,0,0,1000,1030,1030,1000\n1768430021.000,1768430100.000,10,0,1,Lift 1,,ski_lift,,,,79.000,2.1,160.0,80.0,3,0,0,1000,1080,1000,1080\n",
};

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++)
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(data: Buffer) {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function makeZip(
  files: Record<string, string> = sampleFiles,
  { method = 8, encrypted = false } = {},
) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = Buffer.from(name);
    const data = Buffer.from(text);
    const compressed = method === 8 ? deflateRawSync(data) : data;
    const crc = crc32(data);
    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(encrypted ? 1 : 0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    nameBytes.copy(local, 30);
    localParts.push(local, compressed);

    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(encrypted ? 1 : 0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    nameBytes.copy(central, 46);
    centralParts.push(central);
    offset += local.length + compressed.length;
  }
  const central = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, central, end]);
}

test("parses deflated SkiTracks files and maps node and segment units", () => {
  const parsed = parseSkiz(makeZip());
  assert.deepEqual(parsed.metadata, {
    name: "Sample",
    description: "en:Demo;ja:テスト;",
    activity: "skiing",
    start: "2026-01-15T07:00:00+09:00",
    finish: "2026-01-15T08:00:00+09:00",
    timezone: "+09:00",
    durationSeconds: 3600,
    resort: "テスト",
  });
  assert.deepEqual(parsed.nodes[0], {
    time: 1768430000000,
    longitude: 136.2,
    latitude: 36.1,
    altitude: 1000.5,
    speed: 2.5,
  });
  assert.equal(parsed.nodes[1].time, 1768430001250);
  assert.deepEqual(
    parsed.segments.map(({ type, sequence, distance, verticalChange }) => ({
      type,
      sequence,
      distance,
      verticalChange,
    })),
    [
      { type: "ski_run", sequence: 1, distance: 100, verticalChange: -30 },
      { type: "lift", sequence: 1, distance: 160, verticalChange: 80 },
    ],
  );
});

test("accepts stored ZIP entries", () => {
  assert.equal(
    parseSkiz(makeZip(sampleFiles, { method: 0 })).segments.length,
    2,
  );
});

test("preserves SkiTracks unknown speed sentinel", () => {
  const parsed = parseSkiz(
    makeZip({
      ...sampleFiles,
      "Nodes.csv": sampleFiles["Nodes.csv"].replace(",180,2.5,", ",-1,-1,"),
    }),
  );
  assert.equal(parsed.nodes[0].speed, -1);
});

test("rejects missing files, malformed rows, unsupported activity, and bad CRC", () => {
  assert.throws(
    () => parseSkiz(makeZip({ "Track.xml": sampleFiles["Track.xml"] })),
    SkizFormatError,
  );
  assert.throws(
    () => parseSkiz(makeZip({ ...sampleFiles, "Nodes.csv": "bad\n" })),
    SkizFormatError,
  );
  assert.throws(
    () =>
      parseSkiz(
        makeZip({
          ...sampleFiles,
          "Track.xml": sampleFiles["Track.xml"].replace("skiing", "walking"),
        }),
      ),
    SkizFormatError,
  );
  const corrupt = makeZip();
  const centralEntry = corrupt.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  corrupt[centralEntry + 16] ^= 1;
  assert.throws(() => parseSkiz(corrupt), SkizFormatError);
});

test("rejects encrypted, over-limit, and non-ZIP inputs", () => {
  assert.throws(
    () => parseSkiz(makeZip(sampleFiles, { encrypted: true })),
    SkizFormatError,
  );
  assert.throws(
    () => parseSkiz(Buffer.alloc(MAX_SKIZ_BYTES + 1)),
    SkizFormatError,
  );
  assert.throws(() => parseSkiz(Buffer.from("not a zip")), SkizFormatError);
});
