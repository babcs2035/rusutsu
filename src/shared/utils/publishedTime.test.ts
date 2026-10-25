import assert from "node:assert/strict";
import { test } from "node:test";
import { formatPublishedTime, parsePublishedTime } from "./publishedTime";

test("parses dated crawler formats and preserves omitted year or time", () => {
  const cases = [
    ["2026 2/11 (水) 06:58更新", 2026, 2, 11, 6, 58, "minute"],
    ["02.25 SUN", null, 2, 25, null, null, "day"],
    ["2026年04月27日【Mon】06:42更新", 2026, 4, 27, 6, 42, "minute"],
    ["2025.10.27.Mon", 2025, 10, 27, null, null, "day"],
    ["Aug 13 10:04am updated", null, 8, 13, 10, 4, "minute"],
  ] as const;
  for (const [input, year, month, day, hour, minute, precision] of cases) {
    const parsed = parsePublishedTime(input);
    assert.ok(parsed, input);
    assert.deepEqual(
      [
        parsed.year,
        parsed.month,
        parsed.day,
        parsed.hour,
        parsed.minute,
        parsed.precision,
      ],
      [year, month, day, hour, minute, precision],
    );
  }
  const dateOnly = parsePublishedTime("02.25 SUN");
  assert.ok(dateOnly);
  assert.equal(formatPublishedTime(dateOnly), "2/25");
});

test("parses Japanese and English clock styles without filling missing fields", () => {
  const cases = [
    ["午前8時現在計測", 8, null, null, "hour"],
    ["02.15 AM6:40更新", 6, 40, null, "minute"],
    ["2026/03/22 PM 5:00 更新", 17, 0, null, "minute"],
    ["2026年3月29日(日)06:30更新", 6, 30, null, "minute"],
    ["2026/03/29 16:00 現在\n期間外", 16, 0, null, "minute"],
    ["2026-03-29 6時12分09秒", 6, 12, 9, "second"],
  ] as const;
  for (const [input, hour, minute, second, precision] of cases) {
    const parsed = parsePublishedTime(input);
    assert.ok(parsed, input);
    assert.deepEqual(
      [parsed.hour, parsed.minute, parsed.second, parsed.precision],
      [hour, minute, second, precision],
    );
  }
  const hourOnly = parsePublishedTime("午前8時現在計測");
  assert.ok(hourOnly);
  assert.equal(formatPublishedTime(hourOnly), "8時");
  const dated = parsePublishedTime("2026年04月27日");
  assert.ok(dated);
  assert.equal(formatPublishedTime(dated), "2026/4/27");
  const afternoon = parsePublishedTime("2026/03/22 PM 5:00 更新");
  assert.ok(afternoon);
  assert.equal(formatPublishedTime(afternoon), "2026/3/22 17:00");
});

test("validates calendar and clock fields including yearless leap days", () => {
  assert.equal(parsePublishedTime("2/29")?.day, 29);
  assert.equal(parsePublishedTime("2025/02/29")?.precision, null);
  assert.equal(parsePublishedTime("2024/02/29")?.precision, "day");
  assert.equal(parsePublishedTime("2026/13/01")?.precision, null);
  assert.equal(parsePublishedTime("2026/03/01 24:00")?.precision, null);
  assert.equal(parsePublishedTime("2026/03/01 12:60")?.precision, null);
  assert.equal(parsePublishedTime("0000/01/01")?.precision, null);
  assert.equal(parsePublishedTime("9999-12-31T23:30:00Z")?.precision, null);
  assert.equal(parsePublishedTime("0001-12-31T23:30:00Z")?.year, 2);
});

test("normalizes fullwidth forms and converts numeric UTC offsets to JST", () => {
  const parsed = parsePublishedTime(
    "２０２６／３／２９ ０１：３０＋００：００",
  );
  assert.ok(parsed);
  assert.deepEqual(
    [parsed.year, parsed.month, parsed.day, parsed.hour, parsed.minute],
    [2026, 3, 29, 10, 30],
  );
  const rollover = parsePublishedTime("2026-03-29 23:30-02:00");
  assert.ok(rollover);
  assert.deepEqual(
    [
      rollover.year,
      rollover.month,
      rollover.day,
      rollover.hour,
      rollover.minute,
    ],
    [2026, 3, 30, 10, 30],
  );
  assert.equal(
    parsePublishedTime("2026-03-29 23:30:45.123456+00:00")?.second,
    45,
  );
  assert.deepEqual(parsePublishedTime("2026-03-29T23:30:00Z"), {
    raw: "2026-03-29T23:30:00Z",
    year: 2026,
    month: 3,
    day: 30,
    hour: 8,
    minute: 30,
    second: 0,
    precision: "second",
    timeZone: "Asia/Tokyo",
  });
  assert.equal(parsePublishedTime("2/28 23:30Z")?.precision, null);
  assert.equal(parsePublishedTime("8時+05:30")?.precision, null);
  const seconds = parsePublishedTime("08:30:15");
  assert.ok(seconds);
  assert.equal(formatPublishedTime(seconds), "08:30:15");
});

test("returns null for empty markers and leaves ambiguous or malformed text unparsed", () => {
  for (const input of [null, 12, "", " — ", "現在更新", "  更新 "]) {
    assert.equal(parsePublishedTime(input), null);
  }
  for (const input of [
    "2025-05-11 07:48 ※気温は2025-05-11 23:20",
    "3/29〜4/4",
    "3/29 (4/4)",
    "2026/3/29 08:00 ※気温は23:30",
    "not a date",
  ]) {
    const parsed = parsePublishedTime(input);
    assert.ok(parsed, input);
    assert.equal(parsed.precision, null, input);
    assert.equal(formatPublishedTime(parsed), null);
  }
  const time = parsePublishedTime("8:30");
  assert.ok(time);
  assert.equal(formatPublishedTime(time), "08:30");
  const hour = parsePublishedTime("8時");
  assert.ok(hour);
  assert.equal(formatPublishedTime(hour), "8時");
  const dashPlaceholder = parsePublishedTime("2025年5月6日(火・振休) － 現在");
  assert.ok(dashPlaceholder);
  assert.equal(dashPlaceholder.precision, "day");
  const separatedClock = parsePublishedTime("2026/02/26 - 07:10 更新");
  assert.ok(separatedClock);
  assert.equal(separatedClock.precision, "minute");
});
