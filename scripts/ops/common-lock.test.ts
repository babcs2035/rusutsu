// common.sh の運用ロックが作業時間に依存せず，終了後に回復することを検証する．
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { testArtifactPath } from "../testArtifacts";

const commonPath = path.resolve("scripts/ops/common.sh");

const hasFlock = spawnSync("flock", ["--version"]).status === 0;
test("operation lock rejects a concurrent process and releases on owner exit", {
  skip: !hasFlock && !process.env.CI,
}, async () => {
  const directory = mkdtempSync(testArtifactPath("operation-lock-"));
  const lockScript = `source "$1"; OPS_STATE_DIR="$2"; OPS_PROJECT=test; lock_operations`;
  const owner = spawn(
    "bash",
    [
      "-c",
      `${lockScript}; echo locked; sleep 30`,
      "bash",
      commonPath,
      directory,
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  try {
    await new Promise<void>((resolve, reject) => {
      let output = "";
      owner.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString();
        if (output.includes("locked")) resolve();
      });
      owner.once("error", reject);
      owner.once("exit", code => {
        reject(new Error(`Lock owner exited before acquiring it (${code}).`));
      });
    });

    const competing = spawn(
      "bash",
      ["-c", lockScript, "bash", commonPath, directory],
      {
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const competingStatus = await new Promise<number | null>(resolve => {
      competing.once("exit", code => resolve(code));
    });
    assert.notEqual(competingStatus, 0);

    owner.kill("SIGTERM");
    await new Promise<void>(resolve => owner.once("exit", () => resolve()));

    const recovered = spawn(
      "bash",
      [
        "-c",
        `${lockScript}; release_operations`,
        "bash",
        commonPath,
        directory,
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const recoveredStatus = await new Promise<number | null>(resolve => {
      recovered.once("exit", code => resolve(code));
    });
    assert.equal(recoveredStatus, 0);
  } finally {
    owner.kill("SIGKILL");
    rmSync(directory, { recursive: true, force: true });
  }
});
