import assert from "node:assert/strict";
import { test } from "node:test";
import { getResortReadingInfo } from "@/lib/resortReadings";
import { formerNamesSchema } from "./readingContract";

test("reading projection uses DB values, including intentional clearing", () => {
  assert.deepEqual(
    getResortReadingInfo({
      nameRuby: [{ text: "山", ruby: "やま" }, { text: "スキー場" }],
      formerNames: [{ name: "旧山", reading: "きゅうやま" }],
    }),
    {
      nameRuby: [{ text: "山", ruby: "やま" }, { text: "スキー場" }],
      reading: "やまスキー場",
      formerNames: [{ name: "旧山", reading: "きゅうやま" }],
    },
  );
  assert.deepEqual(getResortReadingInfo({ nameRuby: [], formerNames: [] }), {
    nameRuby: null,
    reading: null,
    formerNames: [],
  });
  assert.equal(formerNamesSchema.safeParse([{ name: "" }]).success, false);
});

test("former names support partial ruby and derive the searchable reading", () => {
  const nameRuby = [
    { text: "奥伊吹", ruby: "おくいぶき" },
    { text: "スキー" },
    { text: "場", ruby: "じょう" },
  ];
  const [former] = formerNamesSchema.parse([
    {
      name: "奥伊吹スキー場",
      reading: "古い読み",
      nameRuby,
    },
  ]);
  assert.deepEqual(former.nameRuby, nameRuby);
  assert.equal(former.reading, "おくいぶきスキーじょう");
  assert.deepEqual(
    getResortReadingInfo({ nameRuby: [], formerNames: [former] }).formerNames,
    [former],
  );
});

test("former names reject mismatched text and overlong combined readings", () => {
  assert.equal(
    formerNamesSchema.safeParse([
      {
        name: "奥伊吹スキー場",
        nameRuby: [{ text: "奥伊吹", ruby: "おくいぶき" }],
      },
    ]).success,
    false,
  );
  assert.equal(
    formerNamesSchema.safeParse([
      {
        name: "山里",
        nameRuby: [
          { text: "山", ruby: "や".repeat(300) },
          { text: "里", ruby: "さと" },
        ],
      },
    ]).success,
    false,
  );
});

test("explicitly clearing ruby removes the old searchable reading", () => {
  const [former] = formerNamesSchema.parse([
    {
      name: "奥伊吹スキー場",
      reading: "おくいぶきすきーじょう",
      nameRuby: [],
    },
  ]);
  assert.deepEqual(former.nameRuby, []);
  assert.equal(former.reading, undefined);
});
