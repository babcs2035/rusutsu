import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
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
        if 'RepoTags' in template:
            current=json.loads((pathlib.Path(os.environ['OPS_TEST_STATE'])/'deployed-image.json').read_text())['current']
            print(json.dumps({'Id':current['imageId'],'RepoTags':['ghcr.io/babcs2035/rusutsu:'+current['sha']],'RepoDigests':['ghcr.io/babcs2035/rusutsu@'+current['digest']],'Config':{'Labels':{'com.rusutsu.image-cleanup':'app'}}}))
        elif '.Id' in template: print('sha256:'+'a'*64)
        else: print('ghcr.io/babcs2035/rusutsu@sha256:'+'a'*64)
elif args[0]=='inspect':
    if '--format' not in args: print((root/'containers.json').read_text())
    elif '.Image' in args[args.index('--format')+1]: print('sha256:'+'a'*64)
    elif 'Labels' in args[args.index('--format')+1]: print('test-project')
    else: print('test-image')
elif args[0]=='run' and '--pull' in args:
    print('disposable-restore-container')
elif args[0]=='run' and '--workdir' in args:
    start=args.index('--entrypoint')+3
    script=args[start:]
    script[0]=str(pathlib.Path(os.environ['OPS_TEST_SCRIPTS'])/script[0])
    state=pathlib.Path(os.environ['OPS_TEST_STATE'])
    if script[0].endswith('prepare-environment.ts'): script.append(str(state))
    if script[0].endswith('deployment-image.ts') and script[1] in ('recorded-image-id','verify-before-switch'):
        current=json.loads((state/'deployed-image.json').read_text())['current']
        if script[1]=='recorded-image-id': print(current['imageId'])
        elif mode=='invalid-rollback': sys.exit(1)
        sys.exit(0)
    if script[0].endswith('deployment-image.ts') and script[1]=='record':
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
        if mode=='archive' or (mode=='restore' and '--exit-on-error' in args): sys.exit(1)
        print('; PostgreSQL archive contents')
elif args[0]=='compose':
    if '--format' in args:
        app={k:os.environ.get(k,'') for k in ['AUTH_URL','API_BEARER_TOKEN']}
        app['PUBLIC_READINESS_URL']=os.environ.get('API_BASE_URL','')
        print(json.dumps({'services':{'app':{'environment':app}},'volumes':{'postgres_data':{'external':True,'name':'existing-data'}}}))
    elif any('check-existing-database' in a for a in args) and mode=='connection': sys.exit(1)
    elif 'migrate' in args and mode=='migration': sys.exit(1)
    elif any('migrateCanonicalMaps' in a for a in args) and mode=='canonical-maps': sys.exit(1)
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
    path.join(root, "bin", "flock"),
    '#!/bin/sh\n[ "${OPS_TEST_FAILURE:-}" != lock ]\n',
    { mode: 0o700 },
  );
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
    run(
      script: string,
      extraEnv: Record<string, string> = {},
      args: string[] = [],
    ) {
      return spawnSync("bash", [path.join(opsRoot, script), ...args], {
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
    const backupRoot = path.join(f.root, "project", "backups");
    const corrupt = "rusutsu-db-20260901T000000Z-cccccccc";
    mkdirSync(path.join(backupRoot, corrupt), { recursive: true, mode: 0o700 });
    writeFileSync(path.join(backupRoot, corrupt, "database.dump"), "corrupt");
    const unrelated = path.join(f.root, "unrelated-backup-target");
    mkdirSync(unrelated);
    writeFileSync(path.join(unrelated, "keep.txt"), "keep");
    const linked = "rusutsu-db-20260902T000000Z-dddddddd";
    symlinkSync(unrelated, path.join(backupRoot, linked));
    mkdirSync(path.join(backupRoot, "unrelated-entry"));

    const result = f.run("backup-database.sh");
    assert.equal(result.status, 0, result.stderr);
    const generations = readdirSync(backupRoot);
    const completed = generations.find(
      name => ![corrupt, linked, "unrelated-entry"].includes(name),
    );
    assert.ok(completed);
    assert.deepEqual(readdirSync(path.join(backupRoot, completed)).sort(), [
      "SHA256SUMS",
      "archive.list",
      "database.dump",
      "metadata.json",
    ]);
    assert.ok(generations.includes(corrupt));
    assert.ok(generations.includes(linked));
    assert.ok(generations.includes("unrelated-entry"));
    assert.equal(
      readFileSync(path.join(unrelated, "keep.txt"), "utf8"),
      "keep",
    );
    assert.ok(f.calls().indexOf("pg_dump") < f.calls().indexOf("pg_restore"));
    assert.ok(
      f.calls().indexOf("pg_database_size") < f.calls().indexOf("pg_dump"),
    );
    assert.doesNotMatch(f.calls(), /rclone|age --|scp|upload-artifact/);
    assert.match(result.stdout, /Verified VPS-local database backup/);
    const restore = f.run("restore-backup-test.sh");
    assert.equal(restore.status, 0, restore.stderr);
    assert.match(f.calls(), /to_regclass/);
  } finally {
    f.clean();
  }
});

test("backup with restore verifies the generation it created even when another generation sorts first", async () => {
  const f = fixture();
  try {
    const backupRoot = path.join(f.root, "project", "backups");
    const incomplete = ".incomplete-aaaaaaaa";
    mkdirSync(path.join(backupRoot, incomplete), {
      recursive: true,
      mode: 0o700,
    });
    writeFileSync(path.join(backupRoot, incomplete, "database.dump"), "PGDMP");
    writeFileSync(path.join(backupRoot, incomplete, "archive.list"), "archive");
    const newer = await finalize(
      backupRoot,
      incomplete,
      "rusutsu-db-20990101T000000Z-aaaaaaaa",
      "2099-01-01T00:00:00.000Z",
    );

    const result = f.run("backup-database.sh", {}, ["--verify-restore"]);
    assert.equal(result.status, 0, result.stderr);
    const generated = /^Verified VPS-local database backup: (\S+)$/mu.exec(
      result.stdout,
    )?.[1];
    assert.ok(generated);
    assert.notEqual(generated, newer);
    assert.ok(result.stdout.includes(`on this VPS: ${generated}`));
    assert.ok(
      f.calls().includes(`local-backup.ts verify-generation ${generated}`),
    );
    assert.doesNotMatch(f.calls(), /verify-latest/u);
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

test("insufficient space is checked before a legacy backup is copied or restored", async () => {
  const f = fixture();
  try {
    const legacyRoot = path.join(f.stateRoot, "backups");
    const legacyName = "rusutsu-db-20260905T000000Z-aaaaaaaa";
    const incomplete = ".incomplete-aaaaaaaa";
    mkdirSync(path.join(legacyRoot, incomplete), {
      recursive: true,
      mode: 0o700,
    });
    writeFileSync(path.join(legacyRoot, incomplete, "database.dump"), "PGDMP");
    writeFileSync(path.join(legacyRoot, incomplete, "archive.list"), "archive");
    await finalize(
      legacyRoot,
      incomplete,
      legacyName,
      "2026-09-05T00:00:00.000Z",
    );

    const result = f.run("backup-database.sh", { OPS_TEST_FAILURE: "space" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Insufficient free space/);
    assert.doesNotMatch(
      f.calls(),
      /migrate-legacy|restore-backup-test|pg_dump/,
    );
    assert.ok(readdirSync(legacyRoot).includes(legacyName));
    assert.deepEqual(readdirSync(path.join(f.root, "project", "backups")), []);
  } finally {
    f.clean();
  }
});

test("corrupt backup quarantine is lock-protected and preserves the generation", () => {
  const f = fixture();
  try {
    const backupRoot = path.join(f.root, "project", "backups");
    const name = "rusutsu-db-20260905T000000Z-aaaaaaaa";
    mkdirSync(path.join(backupRoot, name), { recursive: true, mode: 0o700 });
    writeFileSync(path.join(backupRoot, name, "database.dump"), "preserve");

    const result = f.run("backup-database.sh", {}, [
      "--quarantine-invalid",
      name,
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(readdirSync(f.stateRoot).includes("operation.lock"));
    assert.ok(!readdirSync(backupRoot).includes(name));
    assert.equal(
      readFileSync(
        path.join(backupRoot, ".quarantine", name, "database.dump"),
        "utf8",
      ),
      "preserve",
    );
    assert.doesNotMatch(f.calls(), /pg_dump|restore-backup-test/);
  } finally {
    f.clean();
  }
});

test("legacy backup preview copies nothing and failed restore preserves the source", async () => {
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
    mkdirSync(path.join(legacyRoot, ".incomplete-cccccccc"), {
      mode: 0o700,
    });
    writeFileSync(
      path.join(legacyRoot, ".incomplete-cccccccc", "database.dump"),
      "PGDMP-next-legacy",
    );
    writeFileSync(
      path.join(legacyRoot, ".incomplete-cccccccc", "archive.list"),
      "archive next legacy",
    );
    const laterGeneration = await finalize(
      legacyRoot,
      ".incomplete-cccccccc",
      "rusutsu-db-20260907T000000Z-cccccccc",
      "2026-09-07T00:00:00.000Z",
    );

    const preview = f.run("backup-database.sh", {}, ["--dry-run"]);
    assert.equal(preview.status, 0, preview.stderr);
    assert.deepEqual(
      preview.stdout.trim().split("\n").sort(),
      [generation, laterGeneration].sort(),
    );
    assert.deepEqual(readdirSync(path.join(f.root, "project", "backups")), []);

    const result = f.run("backup-database.sh", {
      OPS_TEST_FAILURE: "restore",
    });
    assert.notEqual(result.status, 0);
    assert.ok(!f.calls().includes("pg_dump"));
    assert.match(f.calls(), /pg_restore --exit-on-error/);
    assert.doesNotMatch(f.calls(), /confirm-legacy/);
    assert.ok(readdirSync(legacyRoot).includes(generation));
    assert.ok(readdirSync(legacyRoot).includes(laterGeneration));
    assert.ok(
      readdirSync(path.join(f.root, "project", "backups")).includes(generation),
    );
    assert.equal(
      readdirSync(path.join(f.root, "project", "backups")).length,
      1,
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
      assert.ok(!f.calls().includes("migrate deploy"));
      assert.ok(!f.calls().includes(" stop "));
      if (failure === "lock") assert.doesNotMatch(f.calls(), /docker pull/u);
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
    assert.ok(f.calls().includes("migrate deploy"));
    const canonical = f.calls().indexOf("migrateCanonicalMaps.ts --deploy");
    assert.ok(canonical > f.calls().indexOf("migrate deploy"));
    assert.ok(canonical < f.calls().indexOf("up -d --wait --wait-timeout"));
    assert.doesNotMatch(f.calls(), /rebuildCourseRecommendations/);
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

test("an unverifiable rollback image stops deployment before app or DB changes", () => {
  const f = fixture();
  try {
    const record = {
      current: {
        repository: "ghcr.io/babcs2035/rusutsu",
        tag: "b".repeat(40),
        sha: "b".repeat(40),
        imageId: `sha256:${"b".repeat(64)}`,
        digest: `sha256:${"c".repeat(64)}`,
      },
      previous: null,
    };
    const file = path.join(f.stateRoot, "deployed-image.json");
    writeFileSync(file, JSON.stringify(record));
    assert.notEqual(
      f.run("deploy.sh", { OPS_TEST_FAILURE: "invalid-rollback" }).status,
      0,
    );
    assert.match(f.calls(), /deployment-image.ts verify-before-switch/);
    assert.doesNotMatch(f.calls(), /pg_dump| stop |migrate deploy/);
    assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), record);
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
      "migrate deploy",
      "importCanonicalDataDocuments.ts --initialize",
      "importSkiResortShortNames.ts --initialize",
      "migrateCanonicalMaps.ts --deploy",
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

for (const failure of ["readiness", "migration", "canonical-maps"]) {
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
      if (failure === "canonical-maps")
        assert.ok(!f.calls().includes("up -d --wait --wait-timeout"));
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
