import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { shellEnvironment } from "./prepare-environment.mjs";
import { existingContainers, settings } from "./test-fixtures.mjs";

const opsRoot = path.resolve("scripts/ops");
// Docker/DB are simulated here; Node helpers and generated shell settings run
// for real. The separate local integration exercise uses a disposable Postgres.
const toolStub = `#!/usr/bin/env python3
import json,os,pathlib,subprocess,sys
args=sys.argv[1:]
root=pathlib.Path(os.environ['OPS_TEST_ROOT'])
mode=os.environ.get('OPS_TEST_FAILURE','')
with (root/'calls').open('a') as f: f.write('docker '+' '.join(args)+' [profiles='+os.environ.get('COMPOSE_PROFILES','')+']\\n')
if args[0]=='inspect':
    if '--format' not in args: print((root/'containers.json').read_text())
    elif 'Labels' in args[args.index('--format')+1]: print('test-project')
    else: print('test-image')
elif args[0]=='run' and '--name' in args:
    if mode=='lock': sys.exit(1)
    print('owned-lock-container')
elif args[0]=='run' and '--workdir' in args:
    start=args.index('--entrypoint')+3
    script=args[start:]
    script[0]=str(pathlib.Path(os.environ['OPS_TEST_SCRIPTS'])/script[0])
    if script[0].endswith('prepare-environment.mjs'): script.append(str(root/'state'))
    env=dict(os.environ,OPS_BACKUP_TEST_ROOT=str(root/'state'/'backups'))
    sys.exit(subprocess.run([os.environ['OPS_TEST_NODE']]+script,env=env).returncode)
elif args[0]=='exec':
    if 'pg_dump' in ' '.join(args):
        if mode=='dump': sys.exit(1)
        if mode!='empty': sys.stdout.buffer.write(b'PGDMP-private-data')
    elif 'pg_restore' in args:
        sys.stdin.buffer.read()
        if mode=='archive': sys.exit(1)
        print('; PostgreSQL archive contents')
elif args[0]=='compose':
    if '--format' in args:
        app={k:os.environ.get(k,'') for k in ['AUTH_URL','INTERNAL_DATA_API_ADMIN_TOKEN','INTERNAL_DATA_API_CRAWLER_TOKEN','INTERNAL_DATA_API_DIAGNOSTICS_TOKEN']}
        app['PUBLIC_READINESS_URL']=os.environ.get('DATA_API_BASE_URL','')
        print(json.dumps({'services':{'app':{'environment':app}},'volumes':{'postgres_data':{'external':True,'name':'existing-data'}}}))
    elif any('check-existing-database' in a for a in args) and mode=='connection': sys.exit(1)
    elif 'migrate' in args and mode=='migration': sys.exit(1)
    elif any('check-readiness' in a for a in args) and mode=='readiness': sys.exit(1)
`;

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "rusutsu-ops-test-"));
  for (const name of ["project", "bin", "state"])
    mkdirSync(path.join(root, name), { mode: 0o700 });
  writeFileSync(
    path.join(root, "containers.json"),
    JSON.stringify(existingContainers()),
  );
  writeFileSync(path.join(root, "bin", "docker"), toolStub, { mode: 0o700 });
  writeFileSync(
    path.join(root, "project", "db-change-manifest.sha256"),
    "test-manifest\n",
  );
  writeFileSync(path.join(root, "project", ".env"), "ORIGINAL=untouched\n");
  writeFileSync(
    path.join(root, "state", "runtime.env.sh"),
    shellEnvironment({ COMPOSE_PROJECT_NAME: "test-project" }),
    { mode: 0o600 },
  );
  return {
    root,
    run(script: string, extraEnv: Record<string, string> = {}) {
      return spawnSync("bash", [path.join(opsRoot, script)], {
        cwd: path.join(root, "project"),
        env: {
          ...process.env,
          PATH: `${root}/bin:${process.env.PATH}`,
          RUSUTSU_OPS_STATE_DIR: `${root}/state`,
          OPS_TEST_ROOT: root,
          OPS_TEST_SCRIPTS: opsRoot,
          OPS_TEST_NODE: process.execPath,
          RUSUTSU_SETTINGS_B64: Buffer.from(JSON.stringify(settings)).toString(
            "base64",
          ),
          DEPLOY_IMAGE_TAG: "a".repeat(40),
          ...extraEnv,
        },
        encoding: "utf8",
      });
    },
    calls() {
      return readFileSync(path.join(root, "calls"), "utf8");
    },
    clean() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

test("backup stays on the VPS, validates the archive and commits a private generation", () => {
  const f = fixture();
  try {
    const result = f.run("backup-database.sh");
    assert.equal(result.status, 0, result.stderr);
    const root = path.join(f.root, "state", "backups");
    const generations = readdirSync(root);
    assert.equal(generations.length, 1);
    assert.deepEqual(readdirSync(path.join(root, generations[0])).sort(), [
      "SHA256SUMS",
      "archive.list",
      "database.dump",
      "metadata.json",
    ]);
    assert.ok(f.calls().indexOf("pg_dump") < f.calls().indexOf("pg_restore"));
    assert.doesNotMatch(f.calls(), /rclone|age --|scp|upload-artifact/);
    assert.match(result.stdout, /Verified VPS-local database backup/);
  } finally {
    f.clean();
  }
});

for (const failure of ["dump", "empty", "archive", "connection", "lock"]) {
  test(`failed ${failure} prevents migrations and leaves the running application intact`, () => {
    const f = fixture();
    try {
      const result = f.run("deploy.sh", { OPS_TEST_FAILURE: failure });
      assert.notEqual(result.status, 0);
      assert.ok(!f.calls().includes("prisma migrate deploy"));
      assert.ok(!f.calls().includes(" stop "));
      assert.deepEqual(readdirSync(path.join(f.root, "state", "backups")), []);
      assert.equal(
        readFileSync(path.join(f.root, "project", ".env"), "utf8"),
        "ORIGINAL=untouched\n",
      );
    } finally {
      f.clean();
    }
  });
}

test("unchanged DB paths skip backup but still migrate and require public readiness", () => {
  const f = fixture();
  try {
    writeFileSync(
      path.join(f.root, "state", "deployed-db-manifest.sha256"),
      "test-manifest\n",
    );
    const result = f.run("deploy.sh");
    assert.equal(result.status, 0, result.stderr);
    assert.ok(!f.calls().includes("pg_dump"));
    assert.ok(!f.calls().includes("importCanonicalDataDocuments"));
    assert.ok(f.calls().includes("prisma migrate deploy"));
    assert.ok(
      f.calls().includes("check-readiness.mjs https://example.test/rusutsu"),
    );
    assert.match(
      readFileSync(path.join(f.root, "state", "runtime.env.sh"), "utf8"),
      /POSTGRES_VOLUME='existing-data'/,
    );
    assert.doesNotMatch(
      result.stdout + result.stderr,
      /sentinel-db-password|sentinel-auth-secret/,
    );
  } finally {
    f.clean();
  }
});

test("initialization backs up first, then migrates/imports and records only after readiness", () => {
  const f = fixture();
  try {
    const result = f.run("deploy.sh", { INITIALIZE_CANONICAL_DATA: "true" });
    assert.equal(result.status, 0, result.stderr);
    const positions = [
      "check-existing-database.mjs",
      "pg_dump",
      "pg_restore",
      "local-backup.mjs finalize",
      "prepare-artifact-directories.mjs",
      "prisma migrate deploy",
      "importCanonicalDataDocuments.ts --initialize",
      "importSkiResortShortNames.ts --initialize",
      "up -d --wait --wait-timeout",
      "check-readiness.mjs",
    ].map(s => f.calls().indexOf(s));
    assert.ok(
      positions.every(
        (value, i) => value >= 0 && (i === 0 || value > positions[i - 1]),
      ),
    );
    assert.equal(
      readFileSync(
        path.join(f.root, "state", "deployed-image-sha"),
        "utf8",
      ).trim(),
      "a".repeat(40),
    );
  } finally {
    f.clean();
  }
});

for (const failure of ["readiness", "migration"]) {
  test(`failed ${failure} preserves the previous configuration and success record`, () => {
    const f = fixture();
    try {
      const before = readFileSync(
        path.join(f.root, "state", "runtime.env.sh"),
        "utf8",
      );
      assert.notEqual(
        f.run("deploy.sh", { OPS_TEST_FAILURE: failure }).status,
        0,
      );
      assert.ok(
        !readdirSync(path.join(f.root, "state")).includes("deployed-image-sha"),
      );
      assert.equal(
        readFileSync(path.join(f.root, "state", "runtime.env.sh"), "utf8"),
        before,
      );
      assert.ok(
        !readdirSync(path.join(f.root, "state")).includes("pending.env.sh"),
      );
      assert.ok(f.calls().includes("rm -f owned-lock-container"));
    } finally {
      f.clean();
    }
  });
}

for (const enabled of [false, true]) {
  test(`GitHub flag controls scheduler startup (${enabled})`, () => {
    const f = fixture();
    try {
      const result = f.run("deploy.sh", {
        ENABLE_CRAWL_LATEST_SCHEDULER: String(enabled),
        COMPOSE_PROFILES: "crawlers",
      });
      assert.equal(result.status, 0, result.stderr);
      assert.ok(
        f
          .calls()
          .includes(
            `up -d --wait --wait-timeout 180 [profiles=${enabled ? "crawlers" : ""}]`,
          ),
      );
    } finally {
      f.clean();
    }
  });
}

test("duplicate API Secrets fail before any DB backup or change", () => {
  const f = fixture();
  try {
    const invalid = {
      ...settings,
      INTERNAL_DATA_API_CRAWLER_TOKEN: settings.INTERNAL_DATA_API_ADMIN_TOKEN,
    };
    const result = f.run("deploy.sh", {
      RUSUTSU_SETTINGS_B64: Buffer.from(JSON.stringify(invalid)).toString(
        "base64",
      ),
    });
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(f.calls(), /pg_dump|prisma migrate deploy| stop /);
    assert.ok(!result.stderr.includes(settings.INTERNAL_DATA_API_ADMIN_TOKEN));
  } finally {
    f.clean();
  }
});

test("canonical container rejects remote client mode without leaking its URL", () => {
  const result = spawnSync(
    process.execPath,
    [path.join(opsRoot, "start-app.mjs")],
    {
      env: {
        ...process.env,
        DATA_API_BASE_URL: "https://private-host.test/rusutsu",
      },
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /must not set DATA_API_BASE_URL/);
  assert.ok(!result.stderr.includes("private-host"));
});
