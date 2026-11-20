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
import path from "node:path";
import { test } from "node:test";
import { finalize } from "./local-backup.ts";
import { shellEnvironment } from "./prepare-environment.ts";
import { existingContainers, settings } from "./test-fixtures.ts";

const opsRoot = path.resolve("scripts/ops");
// Docker/DB are simulated here; Node helpers and generated shell settings run
// for real. The separate local integration exercise uses a disposable Postgres.
const toolStub = `#!/usr/bin/env python3
import json,os,pathlib,subprocess,sys
args=sys.argv[1:]
root=pathlib.Path(os.environ['OPS_TEST_ROOT'])
mode=os.environ.get('OPS_TEST_FAILURE','')
with (root/'calls').open('a') as f: f.write('docker '+' '.join(args)+' [profiles='+os.environ.get('COMPOSE_PROFILES','')+']\\n')
if args[0]=='image' and args[1]=='inspect':
    if '--format' in args:
        template=args[args.index('--format')+1]
        if '.Id' in template: print('sha256:'+'a'*64)
        else: print('ghcr.io/babcs2035/rusutsu@sha256:'+'a'*64)
elif args[0]=='inspect':
    if '--format' not in args: print((root/'containers.json').read_text())
    elif '.Image' in args[args.index('--format')+1]: print('sha256:'+'a'*64)
    elif 'Labels' in args[args.index('--format')+1]: print('test-project')
    else: print('test-image')
elif args[0]=='run' and '--name' in args:
    if mode=='lock': sys.exit(1)
    print('owned-lock-container')
elif args[0]=='run' and '--workdir' in args:
    start=args.index('--entrypoint')+3
    script=args[start:]
    script[0]=str(pathlib.Path(os.environ['OPS_TEST_SCRIPTS'])/script[0])
    state=pathlib.Path(os.environ['OPS_TEST_STATE'])
    if script[0].endswith('prepare-environment.ts'): script.append(str(state))
    if script[0].endswith('image-cleanup.ts') and script[1]=='record':
        sha,image_id,digest=script[2],script[3],script[4]
        prev=None
        pf=state/'previous-image.json'
        if pf.exists(): prev=json.loads(pf.read_text())['current']
        rec={"current":{"repository":"ghcr.io/babcs2035/rusutsu","tag":sha,"sha":sha,"imageId":image_id,"digest":digest},"previous":prev}
        (state/'deployed-image.json').write_text(json.dumps(rec)+'\\n')
        sys.exit(0)
    env=dict(os.environ,OPS_BACKUP_TEST_ROOT=str(root/'project'/'backups'),OPS_BACKUP_LEGACY_TEST_ROOT=str(state/'backups'))
    sys.exit(subprocess.run([os.environ['OPS_TEST_NODE']]+script,env=env).returncode)
elif args[0]=='exec':
    if 'pg_database_size' in ' '.join(args):
        print('1000')
    elif 'pg_dump' in ' '.join(args):
        if mode=='dump': sys.exit(1)
        if mode!='empty': sys.stdout.buffer.write(b'PGDMP-private-data')
    elif 'pg_restore' in args:
        sys.stdin.buffer.read()
        if mode=='archive': sys.exit(1)
        print('; PostgreSQL archive contents')
elif args[0]=='compose':
    if '--format' in args:
        app={k:os.environ.get(k,'') for k in ['AUTH_URL','API_BEARER_TOKEN']}
        app['PUBLIC_READINESS_URL']=os.environ.get('API_BASE_URL','')
        print(json.dumps({'services':{'app':{'environment':app}},'volumes':{'postgres_data':{'external':True,'name':'existing-data'}}}))
    elif any('check-existing-database' in a for a in args) and mode=='connection': sys.exit(1)
    elif 'migrate' in args and mode=='migration': sys.exit(1)
    elif any('migrateCanonicalMaps' in a for a in args) and mode=='canonical-maps': sys.exit(1)
    elif any('rebuildCourseRecommendations' in a for a in args) and mode=='recommendations': sys.exit(1)
    elif any('check-readiness' in a for a in args) and mode=='readiness': sys.exit(1)
`;

const diskSpaceStub = `#!/usr/bin/env sh
if [ "\${OPS_TEST_FAILURE:-}" = space ]; then printf '1\\n'; else printf '999999999999\\n'; fi
`;

function fixture() {
  const privateTmp = path.resolve("src/private/data/resorts-temporary/tmp");
  mkdirSync(privateTmp, { recursive: true });
  const root = mkdtempSync(path.join(privateTmp, "operations-test-"));
  const stateRoot = path.join(root, "state");
  for (const name of ["project", "bin", "state"])
    mkdirSync(path.join(root, name), { mode: 0o700 });
  writeFileSync(
    path.join(root, "containers.json"),
    JSON.stringify(existingContainers()),
  );
  writeFileSync(path.join(root, "bin", "docker"), toolStub, { mode: 0o700 });
  writeFileSync(path.join(root, "bin", "df"), diskSpaceStub, { mode: 0o700 });
  writeFileSync(
    path.join(root, "project", "db-change-manifest.sha256"),
    "test-manifest\n",
  );
  writeFileSync(path.join(root, "project", ".env"), "ORIGINAL=untouched\n");
  writeFileSync(
    path.join(stateRoot, "runtime.env.sh"),
    shellEnvironment({ COMPOSE_PROJECT_NAME: "test-project" }),
    { mode: 0o600 },
  );
  return {
    root,
    stateRoot,
    run(script: string, extraEnv: Record<string, string> = {}) {
      return spawnSync("bash", [path.join(opsRoot, script)], {
        cwd: path.join(root, "project"),
        env: {
          ...process.env,
          PATH: `${root}/bin:${process.env.PATH}`,
          RUSUTSU_OPS_STATE_DIR: stateRoot,
          OPS_TEST_ROOT: root,
          OPS_TEST_STATE: stateRoot,
          OPS_TEST_SCRIPTS: opsRoot,
          OPS_TEST_NODE: process.execPath,
          DEPLOY_TARGET: path.join(root, "project"),
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
    const root = path.join(f.root, "project", "backups");
    const generations = readdirSync(root);
    assert.equal(generations.length, 1);
    assert.deepEqual(readdirSync(path.join(root, generations[0])).sort(), [
      "SHA256SUMS",
      "archive.list",
      "database.dump",
      "metadata.json",
    ]);
    assert.ok(f.calls().indexOf("pg_dump") < f.calls().indexOf("pg_restore"));
    assert.ok(
      f.calls().indexOf("pg_database_size") < f.calls().indexOf("pg_dump"),
    );
    assert.doesNotMatch(f.calls(), /rclone|age --|scp|upload-artifact/);
    assert.match(result.stdout, /Verified VPS-local database backup/);
  } finally {
    f.clean();
  }
});

test("insufficient free space stops before dumping and preserves backups", async () => {
  const f = fixture();
  try {
    const backupRoot = path.join(f.root, "project", "backups");
    const incomplete = ".incomplete-aaaaaaaa";
    mkdirSync(backupRoot, { recursive: true, mode: 0o700 });
    mkdirSync(path.join(backupRoot, incomplete), { mode: 0o700 });
    writeFileSync(path.join(backupRoot, incomplete, "database.dump"), "PGDMP");
    writeFileSync(path.join(backupRoot, incomplete, "archive.list"), "archive");
    const prior = await finalize(
      backupRoot,
      incomplete,
      "rusutsu-db-20260905T000000Z-aaaaaaaa",
      "2026-09-05T00:00:00.000Z",
    );
    const result = f.run("backup-database.sh", { OPS_TEST_FAILURE: "space" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Insufficient free space/);
    assert.ok(!f.calls().includes("pg_dump"));
    assert.deepEqual(readdirSync(path.join(f.root, "project", "backups")), [
      prior,
    ]);
  } finally {
    f.clean();
  }
});

test("unreadable migrated dump leaves its legacy generation in place", async () => {
  const f = fixture();
  try {
    const legacyRoot = path.join(f.stateRoot, "backups");
    const incomplete = ".incomplete-bbbbbbbb";
    mkdirSync(legacyRoot, { recursive: true, mode: 0o700 });
    mkdirSync(path.join(legacyRoot, incomplete), { mode: 0o700 });
    writeFileSync(
      path.join(legacyRoot, incomplete, "database.dump"),
      "PGDMP-legacy",
    );
    writeFileSync(
      path.join(legacyRoot, incomplete, "archive.list"),
      "archive legacy",
    );
    const generation = await finalize(
      legacyRoot,
      incomplete,
      "rusutsu-db-20260906T000000Z-bbbbbbbb",
      "2026-09-06T00:00:00.000Z",
    );

    const result = f.run("backup-database.sh", {
      OPS_TEST_FAILURE: "archive",
    });
    assert.notEqual(result.status, 0);
    assert.ok(!f.calls().includes("pg_dump"));
    assert.ok(readdirSync(legacyRoot).includes(generation));
    assert.ok(
      readdirSync(path.join(f.root, "project", "backups")).includes(generation),
    );
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
      assert.deepEqual(
        readdirSync(path.join(f.root, "project", "backups")),
        [],
      );
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
      path.join(f.stateRoot, "deployed-db-manifest.sha256"),
      "test-manifest\n",
    );
    const result = f.run("deploy.sh");
    assert.equal(result.status, 0, result.stderr);
    assert.ok(!f.calls().includes("pg_dump"));
    assert.ok(!f.calls().includes("importCanonicalDataDocuments"));
    assert.ok(f.calls().includes("prisma migrate deploy"));
    const rebuild = f
      .calls()
      .indexOf("rebuildCourseRecommendations.ts --apply");
    const canonical = f.calls().indexOf("migrateCanonicalMaps.ts --deploy");
    assert.ok(canonical > f.calls().indexOf("prisma migrate deploy"));
    assert.ok(rebuild > canonical);
    assert.ok(rebuild < f.calls().indexOf("up -d --wait --wait-timeout"));
    assert.ok(
      f.calls().includes("check-readiness.ts https://example.test/rusutsu"),
    );
    assert.match(
      readFileSync(path.join(f.stateRoot, "runtime.env.sh"), "utf8"),
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
      "check-existing-database.ts",
      "pg_dump",
      "pg_restore",
      "local-backup.ts finalize",
      "prepare-artifact-directories.ts",
      "prisma migrate deploy",
      "importCanonicalDataDocuments.ts --initialize",
      "importSkiResortShortNames.ts --initialize",
      "migrateCanonicalMaps.ts --deploy",
      "rebuildCourseRecommendations.ts --apply",
      "up -d --wait --wait-timeout",
      "check-readiness.ts",
    ].map(s => f.calls().indexOf(s));
    assert.ok(
      positions.every(
        (value, i) => value >= 0 && (i === 0 || value > positions[i - 1]),
      ),
    );
    assert.equal(
      readFileSync(path.join(f.stateRoot, "deployed-image-sha"), "utf8").trim(),
      "a".repeat(40),
    );
    const record = JSON.parse(
      readFileSync(path.join(f.stateRoot, "deployed-image.json"), "utf8"),
    );
    assert.equal(record.current.imageId, `sha256:${"a".repeat(64)}`);
    assert.equal(record.current.digest, `sha256:${"a".repeat(64)}`);
    assert.equal(record.previous, null);
  } finally {
    f.clean();
  }
});

for (const failure of [
  "readiness",
  "migration",
  "canonical-maps",
  "recommendations",
]) {
  test(`failed ${failure} preserves the previous configuration and success record`, () => {
    const f = fixture();
    try {
      const before = readFileSync(
        path.join(f.stateRoot, "runtime.env.sh"),
        "utf8",
      );
      assert.notEqual(
        f.run("deploy.sh", { OPS_TEST_FAILURE: failure }).status,
        0,
      );
      assert.ok(!readdirSync(f.stateRoot).includes("deployed-image-sha"));
      assert.equal(
        readFileSync(path.join(f.stateRoot, "runtime.env.sh"), "utf8"),
        before,
      );
      assert.ok(!readdirSync(f.stateRoot).includes("pending.env.sh"));
      assert.ok(f.calls().includes("rm -f owned-lock-container"));
      if (failure === "recommendations" || failure === "canonical-maps")
        assert.ok(!f.calls().includes("up -d --wait --wait-timeout"));
      if (failure === "canonical-maps")
        assert.ok(
          !f.calls().includes("rebuildCourseRecommendations.ts --apply"),
        );
    } finally {
      f.clean();
    }
  });
}

test("deployment starts the scheduler when the GitHub flag is unset", () => {
  const f = fixture();
  try {
    const result = f.run("deploy.sh", {
      ENABLE_CRAWL_LATEST_SCHEDULER: "",
      COMPOSE_PROFILES: "",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(
      f.calls().includes("up -d --wait --wait-timeout 180 [profiles=crawlers]"),
    );
    const saved = readFileSync(
      path.join(f.stateRoot, "runtime.env.sh"),
      "utf8",
    );
    assert.ok(saved.includes("export CRAWL_LATEST_CRON='0 14 * * *'"));
  } finally {
    f.clean();
  }
});

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

test("canonical container rejects remote client mode without leaking its URL", () => {
  const result = spawnSync(
    process.execPath,
    [path.join(opsRoot, "start-app.ts")],
    {
      env: {
        ...process.env,
        API_BASE_URL: "https://private-host.test/rusutsu",
      },
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /must not set API_BASE_URL/);
  assert.ok(!result.stderr.includes("private-host"));
});
