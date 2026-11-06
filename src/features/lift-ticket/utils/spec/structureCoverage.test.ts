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

/** 架空ケースに無い特徴を、施設ごとに返す */
export const uncoveredFeatures = (
  covered: Set<string>,
  real: Array<{ resort: string; data: LiftTicketData }>,
) =>
  real
    .map(({ resort, data }) => ({
      resort,
      missing: [...structureFeaturesOf(data)].filter(
        feature => !covered.has(feature) && !(feature in ACKNOWLEDGED_FEATURES),
      ),
    }))
    .filter(entry => entry.missing.length > 0);

const coveredBy = (fixtures: Array<{ data: LiftTicketData }>) =>
  new Set(fixtures.flatMap(({ data }) => [...structureFeaturesOf(data)]));

test("Y01 架空スキー場と実在施設に同じ関数で特徴を取り出す", async () => {
  const fixtures = await loadFixtures();
  assert.ok(fixtures.length > 0, "spec/fixtures に架空スキー場がありません");
  for (const { name, data } of fixtures)
    assert.ok(structureFeaturesOf(data).size > 0, `${name} の特徴が空`);
});

test("Y02 架空ケースに無い特徴を持つ実在施設が無い", async () => {
  const real = loadRealResorts();
  if (real.length === 0) return; // 料金データの submodule が無い環境
  const missing = uncoveredFeatures(coveredBy(await loadFixtures()), real);
  assert.deepEqual(
    missing.map(({ resort, missing }) => `${resort}: ${missing.join(", ")}`),
    [],
    "架空ケースを足すか、structureCoverageAcknowledged.ts に理由付きで載せる",
  );
});

test("Y03 確認済みの特徴には理由が書かれている", () => {
  for (const [feature, reason] of Object.entries(ACKNOWLEDGED_FEATURES))
    assert.ok(reason.trim().length > 0, `${feature} の理由が空`);
});

test("Y04 スキーマに無い値を持つ実在施設が無い", () => {
  const unknown = loadRealResorts().flatMap(({ resort, data }) =>
    [...structureFeaturesOf(data)]
      .filter(feature => feature.startsWith("new:"))
      .map(feature => `${resort}: ${feature}`),
  );
  assert.deepEqual(unknown, []);
});

test("Y05 架空スキー場から特徴を1つ消すと、その特徴を持つ実在施設が警告に出る", async () => {
  const real = loadRealResorts();
  if (real.length === 0) return;
  const fixtures = await loadFixtures();
  const covered = coveredBy(fixtures);
  const realFeatures = new Set(
    real.flatMap(({ data }) => [...structureFeaturesOf(data)]),
  );
  // 実在施設にあり、確認済みの一覧に無い特徴を1つ選んで消す
  const target = [...covered].find(
    feature => realFeatures.has(feature) && !(feature in ACKNOWLEDGED_FEATURES),
  );
  assert.ok(target, "照合に使える特徴がありません");
  const reduced = new Set([...covered].filter(feature => feature !== target));
  const missing = uncoveredFeatures(reduced, real);
  assert.ok(
    missing.some(entry => entry.missing.includes(target)),
    `${target} を消しても警告が出ない`,
  );
});
