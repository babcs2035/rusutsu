import assert from "node:assert/strict";
import { test } from "node:test";
import { readingFieldsSchema } from "@/server/ski-resorts/readingContract";
import { resortReadingFieldsFromFormData } from "./readingFormData";

test("form submission keeps each former name's partial readings and row order", () => {
  const form = new FormData();
  for (const [name, value] of [
    ["formerName", "奥伊吹スキー場"],
    ["formerRubyText:0", "奥伊吹"],
    ["formerRubyReading:0", "おくいぶき"],
    ["formerRubyText:0", "スキー"],
    ["formerRubyReading:0", ""],
    ["formerRubyText:0", "場"],
    ["formerRubyReading:0", "じょう"],
    ["formerName", "旧山"],
    ["formerRubyText:1", "旧山"],
    ["formerRubyReading:1", "きゅうやま"],
  ])
    form.append(name, value);
  const parsed = readingFieldsSchema.parse(
    resortReadingFieldsFromFormData(form),
  );
  assert.deepEqual(
    parsed.formerNames.map(entry => entry.reading),
    ["おくいぶきスキーじょう", "きゅうやま"],
  );
  assert.equal(parsed.formerNames[0].nameRuby?.[1].ruby, undefined);
  assert.equal(parsed.formerNames[0].nameRuby?.[2].text, "場");
});

test("removing all former ruby rows submits an explicit empty array", () => {
  const form = new FormData();
  form.append("formerName", "奥伊吹スキー場");
  const parsed = readingFieldsSchema.parse(
    resortReadingFieldsFromFormData(form),
  );
  assert.deepEqual(parsed.formerNames[0].nameRuby, []);
  assert.equal(parsed.formerNames[0].reading, undefined);
  form.delete("formerName");
  assert.deepEqual(resortReadingFieldsFromFormData(form).formerNames, []);
});
