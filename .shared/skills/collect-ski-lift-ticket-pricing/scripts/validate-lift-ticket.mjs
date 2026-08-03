#!/usr/bin/env node
/**
 * validate-lift-ticket.mjs
 *
 * リフト券料金JSONを JSON Schema (references/lift-ticket.schema.json) で
 * 検証する。加えて、日付文字列が実在する暦日かどうかを確認する。
 *
 * 使い方:
 *   node validate-lift-ticket.mjs <data.json> [<data2.json> ...] [--schema path]
 *
 * 終了コード: 全ファイルが有効なら 0、1件でも失敗すれば 1。
 */
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
  DEFAULT_SCHEMA_PATH,
  Reporter,
  isValidCalendarDate,
  parseArgs,
  readJson,
} from "./_lib.mjs";

const { files, opts } = parseArgs(process.argv.slice(2), ["schema"]);

if (files.length === 0) {
  console.error(
    "使い方: node validate-lift-ticket.mjs <data.json> [...] [--schema path]",
  );
  process.exit(2);
}

const schemaPath = opts.schema ?? DEFAULT_SCHEMA_PATH;
const schema = readJson(schemaPath);

const AjvClass = Ajv2020.default ?? Ajv2020;
const ajv = new AjvClass({ allErrors: true, strict: false });
const addFormatsFn = addFormats.default ?? addFormats;
addFormatsFn(ajv);
const validate = ajv.compile(schema);

function checkDatesRecursively(value, jsonPath, reporter) {
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value) && !isValidCalendarDate(value)) {
      reporter.error(jsonPath, `実在しない日付です: ${value}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => checkDatesRecursively(v, `${jsonPath}/${i}`, reporter));
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      checkDatesRecursively(v, `${jsonPath}/${k}`, reporter);
    }
  }
}

let anyFailed = false;

for (const file of files) {
  const reporter = new Reporter("schema");
  let data;
  try {
    data = readJson(file);
  } catch (err) {
    reporter.error("/", err.message);
    reporter.print(file);
    anyFailed = true;
    continue;
  }

  const valid = validate(data);
  if (!valid) {
    for (const err of validate.errors ?? []) {
      const where = err.instancePath === "" ? "/" : err.instancePath;
      reporter.error(where, `${err.message} (${JSON.stringify(err.params)})`);
    }
  }

  checkDatesRecursively(data, "", reporter);

  reporter.print(file);
  if (reporter.failed(opts.strict)) anyFailed = true;
}

process.exit(anyFailed ? 1 : 0);
