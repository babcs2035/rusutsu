// 仕様書 Y 節: 架空ケースに当てはまらない実在施設の警告（Y01〜Y05）
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { toClientLiftTicketData } from "../../../../lib/publicLiftTicketData";
import type { LiftTicketData } from "../../types";
import { structureFeaturesOf } from "../structureFeatures";
import { ACKNOWLEDGED_FEATURES } from "./structureCoverageAcknowledged";

const FIXTURE_DIR = path.join(import.meta.dirname, "fixtures");
const REAL_ROOT =
  process.env.LIFT_TICKET_DATA_ROOT ??
  "src/private/data/lift-ticket-test-fixtures/ui";

const isLiftTicketData = (value: unknown): value is LiftTicketData =>
  typeof value === "object" &&
  value != null &&
  "products" in value &&
  "offers" in value &&
  "audiences" in value;

/** spec/fixtures/*.ts が export している架空スキー場 */
const loadFixtures = async () => {
  const files = fs.existsSync(FIXTURE_DIR)
    ? fs.readdirSync(FIXTURE_DIR).filter(name => name.endsWith(".ts"))
    : [];
  const fixtures: Array<{ name: string; data: LiftTicketData }> = [];
  for (const file of files) {
    const module = await import(
      pathToFileURL(path.join(FIXTURE_DIR, file)).href
    );
    for (const [name, value] of Object.entries(module))
      if (isLiftTicketData(value))
        fixtures.push({ name: `${file}:${name}`, data: value });
  }
  return fixtures;
};

/** 実在施設の料金データ（施設ごとに最新シーズン） */
const loadRealResorts = () =>
  fs.existsSync(REAL_ROOT)
    ? fs
        .readdirSync(REAL_ROOT, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .flatMap(entry => {
          const seasons = fs
            .readdirSync(path.join(REAL_ROOT, entry.name))
            .filter(name => name.endsWith(".json"))
            .sort();
          const latest = seasons.at(-1);
          if (!latest) return [];
          return [
            {
              resort: entry.name,
              data: toClientLiftTicketData(
                JSON.parse(
                  fs.readFileSync(
                    path.join(REAL_ROOT, entry.name, latest),
                    "utf8",
                  ),
                ),
              ),
            },
          ];
        })
    : [];

test("施設の料金データが既知の形式と架空ケースで説明できる", async () => {
  const fixtures = await loadFixtures();
  const real = loadRealResorts();
  assert.ok(fixtures.length > 0, "架空の料金データがありません");
  assert.ok(real.length > 0, "照合する施設の料金データがありません");
  const covered = new Set(
    fixtures.flatMap(({ data }) => [...structureFeaturesOf(data)]),
  );
  const issues = real.flatMap(({ resort, data }) =>
    [...structureFeaturesOf(data)]
      .filter(
        feature =>
          feature.startsWith("new:") ||
          (!covered.has(feature) && !ACKNOWLEDGED_FEATURES[feature]?.trim()),
      )
      .map(feature => `${resort}: ${feature}`),
  );
  assert.deepEqual(
    issues,
    [],
    "新しい形式は対応を検討し，未検証の組合せは架空ケースまたは除外の理由を追加する",
  );
});
