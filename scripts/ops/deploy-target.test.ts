import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

for (const shell of ["bash", "zsh"]) {
  const available = spawnSync(shell, ["-c", "exit 0"]).status === 0;
  for (const workflow of ["ci-cd", "database-backup"]) {
    test(`${workflow}: deployment paths work in ${shell}`, {
      skip: !available,
    }, () => {
      const root = mkdtempSync(path.join(os.tmpdir(), "rusutsu-target-"));
      try {
        const target = path.join(root, "deployment files");
        mkdirSync(path.join(target, "scripts/ops"), { recursive: true });
        for (const file of [
          "docker-compose.production.yml",
          "db-change-manifest.sha256",
          "scripts/ops/deploy.sh",
          "scripts/ops/backup-database.sh",
          "scripts/ops/restore-backup-test.sh",
        ])
          writeFileSync(path.join(target, file), "fixture\n");

        const yaml = readFileSync(`.github/workflows/${workflow}.yml`, "utf8");
        const script = yaml.split("          script: |\n")[1];
        assert.ok(script);
        // Execute the actual workflow preflight, stopping before Docker or DB work.
        const preflight = script
          .split(
            / {12}(?:printf '%s'|bash scripts\/ops\/backup-database.sh)/,
          )[0]
          .replace(/^ {12}/gm, "");
        const run = (value: string, code = preflight) =>
          spawnSync(shell, ["-c", `${code}\npwd -P`], {
            cwd: root,
            env: { ...process.env, DEPLOY_TARGET: value },
            encoding: "utf8",
          });
        const relativeToHome = path.relative(os.homedir(), target);
        for (const value of [
          target,
          "./deployment files",
          `~/${relativeToHome}`,
          `$HOME/${relativeToHome}`,
          `\${HOME}/${relativeToHome}`,
        ]) {
          const result = run(value);
          assert.equal(result.status, 0, result.stderr);
          assert.equal(result.stdout.trim(), realpathSync(target));
        }

        // Reproduce the failure in the previous workflow using the same directory.
        assert.notEqual(
          run(`~/${relativeToHome}`, 'set -eu\ncd "$DEPLOY_TARGET"').status,
          0,
        );
        for (const value of ["", `${root}/missing`, "$(touch injected)"]) {
          const result = run(value);
          assert.notEqual(result.status, 0);
          assert.match(result.stderr, /DEPLOY_TARGET/);
          assert.equal(result.stdout, "");
        }
        assert.equal(existsSync(path.join(root, "injected")), false);
        const incomplete = run(root);
        assert.notEqual(incomplete.status, 0);
        assert.match(incomplete.stderr, /missing/);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }
}
