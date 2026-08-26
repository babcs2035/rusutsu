/**
 * src/private/data/resorts の Excel のうち、名前が繋がらなかった行をまとめる。
 *
 * 残すのは「地図の線はあるのに、Excel の名前と一致しない」ものだけ。
 * 逆向き（地図にはあるが Excel に無い）と、そもそも線がまだ無いスキー場は、
 * 名寄せの作業対象ではないので出さない。中身が空のブックも無視する。
 *
 * 使い方:
 *   pnpm tsx scripts/reportResortSheetLinks.ts
 *   pnpm tsx scripts/reportResortSheetLinks.ts --out=path/to/report.csv
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  RESORT_SHEETS_ROOT,
  TEMPORARY_RESORTS_ROOT,
} from "../src/lib/finalizedResortGeojson";
import {
  canonicalBase,
  createBaseNameIndex,
  matchBaseName,
} from "../src/lib/resortMapMerge";
import { readXlsxSheets, type SheetRow } from "../src/lib/xlsxReader";

type Kind = "course" | "lift";

type UnlinkedRow = {
  resortId: string;
  kind: Kind;
  name: string;
  /** searchWord / piste / note のどれかが埋まっているか */
  hasContent: boolean;
  searchWord: string;
  piste: string;
  note: string;
  reason: string;
  /** 地図側にありそうな名前。名寄せの当たりを付けるためのヒント */
  candidates: string;
};

const readGeoNames = async (
  resortId: string,
  directories: string[],
): Promise<{ names: string[]; source: string } | null> => {
  for (const directory of directories) {
    const filePath = path.join(
      TEMPORARY_RESORTS_ROOT,
      directory,
      `${resortId}.geojson`,
    );
    try {
      const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as {
        features?: { properties?: { name?: unknown } }[];
      };
      const names = (parsed.features ?? [])
        .map(feature => feature.properties?.name)
        .filter(
          (name): name is string => typeof name === "string" && name.length > 0,
        );
      if (names.length > 0) return { names, source: directory };
    } catch {
      // 次の候補へ
    }
  }
  return null;
};

const trimmed = (row: SheetRow, key: string) => (row[key] ?? "").trim();

/** 「〜コース」「〜ゲレンデ」のような言い回しの違いを外した形 */
const stripCommonSuffix = (name: string) =>
  name.replace(/(コース|ゲレンデ|エリア|バーン|ライン)$/u, "").trim();

/**
 * Excel の名前に近い、地図側の名前を挙げる。
 * 「ヤマバトコース」と「ヤマバト」のような差を拾うのが狙い。
 */
const suggestGeoNames = (excelName: string, geoNames: string[]): string[] => {
  const target = stripCommonSuffix(excelName);
  if (target.length < 2) return [];

  const matches = new Set<string>();
  for (const geoName of geoNames) {
    const base = stripCommonSuffix(canonicalBase(geoName));
    if (base.length < 2) continue;
    if (base === target || base.includes(target) || target.includes(base)) {
      matches.add(canonicalBase(geoName));
    }
  }
  return [...matches].slice(0, 3);
};

const main = async () => {
  const outArg = process.argv
    .find(arg => arg.startsWith("--out="))
    ?.slice("--out=".length);
  const outPath = path.resolve(
    outArg ?? path.join("src/private/data", "resort-sheet-unlinked.csv"),
  );

  const sheetFiles = (await fs.readdir(RESORT_SHEETS_ROOT))
    .filter(fileName => fileName.endsWith(".xlsx"))
    .sort();

  const rows: UnlinkedRow[] = [];
  let emptyBooks = 0;
  let filledBooks = 0;
  let noGeometryRows = 0;
  let skippedSheets = 0;
  let linkedCourses = 0;
  let linkedLifts = 0;

  for (const fileName of sheetFiles) {
    const resortId = fileName.replace(/\.xlsx$/u, "");
    let sheets: Map<string, SheetRow[]>;
    try {
      sheets = readXlsxSheets(
        await fs.readFile(path.join(RESORT_SHEETS_ROOT, fileName)),
      );
    } catch (error) {
      console.log(`${resortId}: Excel を読めません (${String(error)})`);
      continue;
    }

    const kinds = [
      {
        kind: "course" as Kind,
        sheetRows: (sheets.get("Courses") ?? []).filter(row =>
          trimmed(row, "name"),
        ),
        directories: ["slope_10m", "slope_before"],
      },
      {
        kind: "lift" as Kind,
        sheetRows: (sheets.get("Lifts") ?? []).filter(row =>
          trimmed(row, "name"),
        ),
        directories: ["lift_20m", "lift_before"],
      },
    ];

    if (kinds.every(entry => entry.sheetRows.length === 0)) {
      emptyBooks += 1;
      continue;
    }
    filledBooks += 1;

    for (const entry of kinds) {
      if (entry.sheetRows.length === 0) continue;

      // piste も searchWord も入っていないシートは結び付けない
      const hasLinkableContent = entry.sheetRows.some(
        row => trimmed(row, "piste") || trimmed(row, "searchWord"),
      );
      if (!hasLinkableContent) {
        skippedSheets += 1;
        continue;
      }

      const rowByName = new Map<string, SheetRow>();
      for (const row of entry.sheetRows) {
        rowByName.set(trimmed(row, "name"), row);
      }
      // 表示側とまったく同じ規則で突き合わせる
      const nameIndex = createBaseNameIndex(rowByName.keys());
      const geo = await readGeoNames(resortId, entry.directories);
      const usedSheetNames = new Set<string>();

      if (geo) {
        for (const geoName of geo.names) {
          const matched = matchBaseName(nameIndex, geoName, entry.kind);
          if (!matched) continue;

          usedSheetNames.add(matched);
          if (entry.kind === "course") linkedCourses += 1;
          else linkedLifts += 1;
        }
      }

      // 線がまだ無いスキー場は名寄せのしようがないので数えるだけ
      if (!geo) {
        noGeometryRows += rowByName.size;
        continue;
      }

      for (const [name, row] of rowByName) {
        if (usedSheetNames.has(name)) continue;

        const searchWord = trimmed(row, "searchWord");
        const piste = trimmed(row, "piste");
        const note = trimmed(row, "note");
        rows.push({
          resortId,
          kind: entry.kind,
          name,
          hasContent: Boolean(searchWord || piste || note),
          searchWord,
          piste,
          note,
          reason: `${geo.source} に同じ名前が無い`,
          candidates: suggestGeoNames(name, geo.names).join(" / "),
        });
      }
    }
  }

  const withContent = rows.filter(row => row.hasContent);
  const toCsvCell = (value: string) => `"${value.replace(/"/gu, '""')}"`;
  const csv = [
    "resortId,kind,name,hasContent,candidates,searchWord,piste,note,reason",
    // 中身が入っているものを上に持ってくる
    ...[...rows]
      .sort((a, b) =>
        a.hasContent === b.hasContent
          ? a.resortId.localeCompare(b.resortId)
          : a.hasContent
            ? -1
            : 1,
      )
      .map(row =>
        [
          row.resortId,
          row.kind,
          row.name,
          row.hasContent ? "○" : "",
          row.candidates,
          row.searchWord,
          row.piste,
          // 改行はセルの中で潰す
          row.note.replace(/\r?\n/gu, " "),
          row.reason,
        ]
          .map(toCsvCell)
          .join(","),
      ),
  ].join("\n");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${csv}\n`, "utf8");

  const byResort = new Map<string, number>();
  for (const row of rows) {
    byResort.set(row.resortId, (byResort.get(row.resortId) ?? 0) + 1);
  }

  console.log(
    `Excel: ${sheetFiles.length} 冊（中身あり ${filledBooks} / 空 ${emptyBooks}）`,
  );
  console.log(`結び付いた線: コース ${linkedCourses} / リフト ${linkedLifts}`);
  console.log(
    `\npiste も searchWord も無いので対象外: ${skippedSheets} シート`,
  );
  console.log(
    `線がまだ無いので対象外: ${noGeometryRows} 行（別途、線の用意が必要）`,
  );
  console.log(`\n名前が繋がらなかった行: ${rows.length}`);
  console.log(
    `  コース ${rows.filter(row => row.kind === "course").length} / リフト ${rows.filter(row => row.kind === "lift").length}`,
  );
  console.log(
    `  searchWord / piste / note のどれかが埋まっているもの: ${withContent.length}`,
  );
  console.log(
    `  地図側に近い名前が見つかったもの: ${rows.filter(row => row.candidates).length}`,
  );

  console.log("\n名前が繋がらないスキー場:");
  for (const [resortId, count] of [...byResort.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)) {
    console.log(`  ${resortId}: ${count}`);
  }

  console.log(`\n→ ${outPath}`);
};

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
