/**
 * コース・リフトの表示データを全スキー場ぶん組み立てて、突き合わせの問題を洗い出す。
 *
 * 画面表示は毎回その場で結合するので、中間ファイルを作る手順はもう無い。
 * 代わりにこのスクリプトで、combined_courses.py / combined_lifts.py が
 * 出していたのと同じ警告を裏で拾えるようにしている。
 *
 * 使い方:
 *   pnpm tsx scripts/validateResortMapData.ts            # 全スキー場
 *   pnpm tsx scripts/validateResortMapData.ts rusutsu-resort
 *   pnpm tsx scripts/validateResortMapData.ts --strict   # ❌ があれば異常終了
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  buildResortMapData,
  TEMPORARY_RESORTS_ROOT,
} from "../src/lib/finalizedResortGeojson";
import type { MergeIssue } from "../src/lib/resortMapMerge";

const SOURCE_DIRECTORIES = [
  "slope_10m",
  "lift_20m",
  "slope_before",
  "lift_before",
] as const;

const listResortIds = async (): Promise<string[]> => {
  const ids = new Set<string>();

  for (const directory of SOURCE_DIRECTORIES) {
    let fileNames: string[];
    try {
      fileNames = await fs.readdir(
        path.join(TEMPORARY_RESORTS_ROOT, directory),
      );
    } catch {
      continue;
    }
    for (const fileName of fileNames) {
      if (fileName.endsWith(".geojson")) {
        ids.add(fileName.replace(/\.geojson$/u, ""));
      }
    }
  }

  return [...ids].sort();
};

const countByLevel = (issues: MergeIssue[]) => ({
  errors: issues.filter(issue => issue.level === "error").length,
  warnings: issues.filter(issue => issue.level === "warn").length,
});

const main = async () => {
  const args = process.argv.slice(2);
  const isStrict = args.includes("--strict");
  const targets = args.filter(arg => !arg.startsWith("--"));
  const resortIds = targets.length > 0 ? targets : await listResortIds();

  let totalErrors = 0;
  let totalWarnings = 0;
  let emptyResorts = 0;

  for (const resortId of resortIds) {
    const { data, report } = await buildResortMapData(resortId, {
      temporaryRoot: TEMPORARY_RESORTS_ROOT,
    });
    const issues = [...report.courses, ...report.lifts];
    const { errors, warnings } = countByLevel(issues);
    totalErrors += errors;
    totalWarnings += warnings;

    if (!data) {
      emptyResorts += 1;
      console.log(`\n■ ${resortId}: 表示できるデータがありません`);
      continue;
    }
    if (issues.length === 0) continue;

    const courseSource = data.courses
      ? `${data.courses.source}+${data.courses.baseSource ?? "なし"}`
      : "なし";
    const liftSource = data.lifts
      ? `${data.lifts.source}+${data.lifts.baseSource ?? "なし"}`
      : "なし";
    console.log(
      `\n■ ${resortId}  コース: ${courseSource} / リフト: ${liftSource}  (❌${errors} ⚠️${warnings})`,
    );
    for (const issue of issues) console.log(`  ${issue.message}`);
  }

  console.log(
    `\n=== ${resortIds.length} スキー場を確認: ❌${totalErrors} ⚠️${totalWarnings} / データ無し ${emptyResorts}`,
  );

  if (isStrict && totalErrors > 0) process.exitCode = 1;
};

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
