import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

// distance_10m_update.py は同スクリプト自身の場所からの相対パスで
// slope_before / slope_10m を解決するため、cwd に依存せず絶対パスで呼び出す。
const SCRIPTS_DIR = path.join(process.cwd(), "src", "private", "scripts");
const PYTHON_BIN = path.join(
  SCRIPTS_DIR,
  ".venv-distance-10m",
  "bin",
  "python3",
);
const UPDATE_SCRIPT = path.join(SCRIPTS_DIR, "distance_10m_update.py");

// GSI API 呼び出しは1地点ごとに時間がかかるため、多重実行で
// slope_10m/{resortId}.geojson への書き込みが競合しないよう、
// スキー場単位で直列化するキュー。
const queuesByResortId = new Map<string, Promise<void>>();

const logLines = (resortId: string, chunk: unknown): void => {
  for (const line of String(chunk).split("\n")) {
    if (line.trim() === "") continue;
    console.log(`[elevationSync:${resortId}] ${line}`);
  }
};

const runUpdateScript = (
  resortId: string,
  courseNames: string[],
): Promise<void> =>
  new Promise(resolve => {
    const child = spawn(PYTHON_BIN, [UPDATE_SCRIPT, resortId, ...courseNames], {
      timeout: 30 * 60 * 1000,
    });
    child.stdout.on("data", chunk => logLines(resortId, chunk));
    child.stderr.on("data", chunk => logLines(resortId, chunk));
    child.on("error", error => {
      console.error(
        `[elevationSync:${resortId}] ❌ 標高計算スクリプトを起動できませんでした: ${String(error)}`,
      );
      resolve();
    });
    child.on("close", code => {
      if (code === 0) {
        console.log(
          `[elevationSync:${resortId}] ✅ 標高計算が完了しました: ${courseNames.join(", ")}`,
        );
      } else {
        console.error(
          `[elevationSync:${resortId}] ❌ 標高計算スクリプトが異常終了しました (exit ${String(code)})`,
        );
      }
      resolve();
    });
  });

/**
 * 保存直後に、今回変更のあったコースだけを対象として
 * distance_10m_update.py（国土地理院APIで10m間隔の標高を取得し、
 * slope_10m/{resortId}.geojson を更新するスクリプト）を裏で実行する。
 *
 * - 呼び出し元（Server Action）はこの完了を待たない（fire-and-forget）。
 * - venv や本体スクリプトが存在しない環境（本番など）では黙ってスキップする。
 * - 例外は投げない。保存自体は既に成功しているため、失敗してもログに
 *   残すだけで保存結果には影響させない。
 */
export function queueElevationSync(
  resortId: string,
  courseNames: string[],
): void {
  const uniqueNames = [...new Set(courseNames)].filter(name => name !== "");
  if (uniqueNames.length === 0) return;

  const previous = queuesByResortId.get(resortId) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      const [pythonExists, scriptExists] = await Promise.all([
        fs
          .access(PYTHON_BIN)
          .then(() => true)
          .catch(() => false),
        fs
          .access(UPDATE_SCRIPT)
          .then(() => true)
          .catch(() => false),
      ]);
      if (!(pythonExists && scriptExists)) {
        console.warn(
          `[elevationSync:${resortId}] ⚠️ ${PYTHON_BIN} または ${UPDATE_SCRIPT} が見つからないため、標高計算をスキップしました。`,
        );
        return;
      }
      await runUpdateScript(resortId, uniqueNames);
    })
    .catch(error => {
      console.error(
        `[elevationSync:${resortId}] ❌ 標高計算のキュー処理で予期しないエラーが発生しました: ${String(error)}`,
      );
    });

  queuesByResortId.set(resortId, next);
}
