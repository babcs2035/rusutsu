import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ValidationIssue, ValidationReport } from "../types";
import { SKILL_SCRIPTS_DIR } from "./schemaSpec";

/**
 * ★保存前に Skill 自身の検証スクリプトを実行する。
 *
 * 画面側に検証ロジックを再実装せず、**Skillが正本として持っている3本**を
 * そのまま呼ぶ。理由は2つある:
 *
 * 1. 構造の正本は `lift-ticket.schema.json` であり、これは今も更新されている。
 *    画面がルールを写し取ると必ず古くなり、「画面では通るのに Skill の検証で
 *    落ちるJSON」を人手で作れてしまう
 * 2. taxonomy / coverage のチェックは schema では表せない規則
 *    （`is_default` はちょうど1件、判読不能箇所に確定料金を入れない等）を
 *    見ている。画面から壊せてはいけないのはむしろこちら
 *
 * エラーが1件でもあれば保存しない。警告は保存を止めずに画面へ返す
 * （年末年始の定義漏れなど、人間が判断すべき指摘が含まれる）。
 */
const CHECKS = [
  { id: "schema", script: "validate-lift-ticket.mjs" },
  { id: "taxonomy", script: "check-taxonomy.mjs" },
  { id: "coverage", script: "check-lift-ticket-coverage.mjs" },
] as const;

const TIMEOUT_MS = 60_000;

type ScriptResult = { code: number | null; output: string };

const runScript = (script: string, target: string): Promise<ScriptResult> =>
  new Promise(resolve => {
    const child = spawn(
      process.execPath,
      [path.join(SKILL_SCRIPTS_DIR, script), target],
      { cwd: process.cwd(), timeout: TIMEOUT_MS },
    );
    let output = "";
    child.stdout.on("data", chunk => {
      output += String(chunk);
    });
    child.stderr.on("data", chunk => {
      output += String(chunk);
    });
    child.on("error", error => {
      resolve({ code: null, output: `${output}${String(error)}` });
    });
    child.on("close", code => {
      resolve({ code, output });
    });
  });

/**
 * `ERROR   <file> <path>: <message>` 形式の1行を解釈する。
 * 出力形式は Skill の `scripts/_lib.mjs` の Reporter が決めている。
 */
const parseIssues = (
  check: string,
  target: string,
  output: string,
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  for (const line of output.split("\n")) {
    const matched = /^(ERROR|WARNING)\s+(.*)$/.exec(line.trimEnd());
    if (!matched) continue;
    const level = matched[1] === "ERROR" ? "error" : "warning";
    let rest = matched[2];
    if (rest.startsWith(target)) rest = rest.slice(target.length).trimStart();
    const separator = rest.indexOf(": ");
    const issuePath = separator > 0 ? rest.slice(0, separator) : "/";
    const message = separator > 0 ? rest.slice(separator + 2) : rest;
    issues.push({ level, check, path: issuePath, message });
  }
  return issues;
};

/** 検証スクリプトへ渡すため、保存候補のJSONを一時ファイルへ書き出す */
const writeTemporaryTarget = async (content: string): Promise<string> => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ticket-"));
  const target = path.join(directory, `${randomUUID()}.json`);
  await fs.writeFile(target, content, "utf8");
  return target;
};

export const validateTicketContent = async (
  content: string,
): Promise<ValidationReport> => {
  const checkedAt = new Date().toISOString();
  let target: string;
  try {
    target = await writeTemporaryTarget(content);
  } catch (error) {
    return {
      ok: false,
      issues: [],
      failedToRun: `一時ファイルを作成できませんでした: ${String(error)}`,
      checkedAt,
    };
  }

  try {
    const results = await Promise.all(
      CHECKS.map(async check => ({
        check,
        result: await runScript(check.script, target),
      })),
    );

    const issues: ValidationIssue[] = [];
    const failures: string[] = [];
    for (const { check, result } of results) {
      issues.push(...parseIssues(check.id, target, result.output));
      const hasParsedError = issues.some(
        issue => issue.check === check.id && issue.level === "error",
      );
      // 終了コードが1（=エラーあり）なのに1行も解釈できなかった場合は
      // 検証自体が失敗している（スクリプトが落ちた等）ので保存を止める
      if (result.code !== 0 && !hasParsedError) {
        failures.push(
          `${check.script} の実行に失敗しました (exit ${String(result.code)}): ${result.output.trim().slice(0, 500)}`,
        );
      }
    }

    return {
      ok:
        failures.length === 0 && !issues.some(issue => issue.level === "error"),
      issues,
      failedToRun: failures.length > 0 ? failures.join("\n") : null,
      checkedAt,
    };
  } finally {
    await fs.rm(path.dirname(target), { recursive: true, force: true });
  }
};
