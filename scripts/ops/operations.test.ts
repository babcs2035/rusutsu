import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { test } from "node:test";
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
            record=json.loads((pathlib.Path(os.environ['OPS_TEST_STATE'])/'deployed-image.json').read_text())
            requested=args[-1].rsplit(':',1)[-1]
            current=record['current'] if args[-1].startswith('sha256:') or record['current']['sha']==requested else record['previous']
            if current is None: sys.exit(1)
            print(json.dumps({'Id':current['imageId'],'RepoTags':['ghcr.io/babcs2035/rusutsu:'+current['sha']],'RepoDigests':['ghcr.io/babcs2035/rusutsu@'+current['digest']],'Config':{'Labels':{'com.rusutsu.image-cleanup':'app'}}}))
        elif '.Id' in template: print('sha256:'+'a'*64)
        else: print('ghcr.io/babcs2035/rusutsu@sha256:'+'a'*64)
elif args[0]=='inspect':
    if '--format' not in args: print((root/'containers.json').read_text())
    elif '.Image' in args[args.index('--format')+1]: print('sha256:'+'a'*64)
    elif 'Labels' in args[args.index('--format')+1]: print('test-project')
    else: print('test-image')
elif args[0]=='run' and '--workdir' in args:
    start=args.index('--entrypoint')+3
    script=args[start:]
    script[0]=str(pathlib.Path(os.environ['OPS_TEST_SCRIPTS'])/script[0])
    state=pathlib.Path(os.environ['OPS_TEST_STATE'])
    if script[0].endswith('prepare-environment.ts'): script.append(str(state))
    if script[0].endswith('deployment-image.ts') and script[1] in ('recorded-image-id','verify-before-switch','verify-rollback-target'):
        current=json.loads((state/'deployed-image.json').read_text())['current']
        if script[1]=='recorded-image-id': print(current['imageId'])
        elif mode=='invalid-rollback': sys.exit(1)
        elif script[1]=='verify-rollback-target':
            record=json.loads((state/'deployed-image.json').read_text())
            if script[2] not in [record['current']['sha'], (record['previous'] or {}).get('sha')]: sys.exit(1)
        sys.exit(0)
    if script[0].endswith('deployment-image.ts') and script[1]=='record':
        sha,image_id,digest=script[2],script[3],script[4]
        prev=None
        pf=state/'previous-image.json'
        if pf.exists(): prev=json.loads(pf.read_text())['current']
        rec={"current":{"repository":"ghcr.io/babcs2035/rusutsu","tag":sha,"sha":sha,"imageId":image_id,"digest":digest},"previous":prev}
        (state/'deployed-image.json').write_text(json.dumps(rec)+'\\n')
        sys.exit(0)
    sys.exit(subprocess.run([os.environ['OPS_TEST_NODE']]+script).returncode)
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
const curlStub = `#!/usr/bin/env bash
set -eu
if [[ "\${OPS_TEST_FAILURE:-}" == worker-mismatch && "\${*: -1}" == https://* ]]; then
  printf '%s\\n' 'legacy worker served'
  exit 0
fi
cat "$OPS_TEST_STATE/map-sw.js"
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
  writeFileSync(path.join(root, "bin", "curl"), curlStub, { mode: 0o700 });
  writeFileSync(path.join(root, "project", ".env"), "ORIGINAL=untouched\n");
  mkdirSync(path.join(root, "project", "public"), { recursive: true });
  writeFileSync(
    path.join(root, "project", "public", "map-sw.js"),
    '/* RUSUTSU_MAP_SW_ROLLBACK_COMPATIBLE */\nconst worker = "current";\n',
  );
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

test("deployment migrates the DB and requires public readiness without a fingerprint", () => {
  const f = fixture();
  try {
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
    assert.equal(
      statSync(path.join(f.stateRoot, "map-sw.js")).mode & 0o777,
      0o644,
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
    assert.doesNotMatch(f.calls(), / stop |migrate deploy/);
    assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), record);
  } finally {
    f.clean();
  }
});

test("rollback keeps the pinned worker bytes and skips migrations and initialization", () => {
  const f = fixture();
  try {
    const currentSha = "b".repeat(40);
    const rollbackSha = "a".repeat(40);
    const current = {
      repository: "ghcr.io/babcs2035/rusutsu",
      tag: currentSha,
      sha: currentSha,
      imageId: `sha256:${"b".repeat(64)}`,
      digest: `sha256:${"c".repeat(64)}`,
    };
    const previous = {
      repository: "ghcr.io/babcs2035/rusutsu",
      tag: rollbackSha,
      sha: rollbackSha,
      imageId: `sha256:${"a".repeat(64)}`,
      digest: `sha256:${"d".repeat(64)}`,
    };
    writeFileSync(
      path.join(f.stateRoot, "deployed-image.json"),
      JSON.stringify({ current, previous }),
    );
    const pinned =
      '/* RUSUTSU_MAP_SW_ROLLBACK_COMPATIBLE */\nconst worker = "newer-compatible";\n';
    writeFileSync(path.join(f.stateRoot, "map-sw.js"), pinned, { mode: 0o644 });
    const result = f.run("deploy.sh", {
      DEPLOY_IMAGE_TAG: rollbackSha,
      ROLLBACK_IMAGE_SHA: rollbackSha,
      INITIALIZE_CANONICAL_DATA: "false",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      readFileSync(path.join(f.stateRoot, "map-sw.js"), "utf8"),
      pinned,
    );
    assert.doesNotMatch(
      f.calls(),
      /migrate deploy|--initialize|migrateCanonicalMaps/,
    );
    assert.match(f.calls(), /verify-rollback-target/);
    assert.equal(
      JSON.parse(
        readFileSync(path.join(f.stateRoot, "deployed-image.json"), "utf8"),
      ).current.sha,
      rollbackSha,
    );
  } finally {
    f.clean();
  }
});

test("rollback refuses to replace the app when the pinned worker is missing", () => {
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
      previous: {
        repository: "ghcr.io/babcs2035/rusutsu",
        tag: "a".repeat(40),
        sha: "a".repeat(40),
        imageId: `sha256:${"a".repeat(64)}`,
        digest: `sha256:${"d".repeat(64)}`,
      },
    };
    writeFileSync(
      path.join(f.stateRoot, "deployed-image.json"),
      JSON.stringify(record),
    );
    assert.notEqual(
      f.run("deploy.sh", {
        DEPLOY_IMAGE_TAG: "a".repeat(40),
        ROLLBACK_IMAGE_SHA: "a".repeat(40),
      }).status,
      0,
    );
    assert.doesNotMatch(f.calls(), / stop |migrate deploy/);
    assert.deepEqual(
      JSON.parse(
        readFileSync(path.join(f.stateRoot, "deployed-image.json"), "utf8"),
      ),
      record,
    );
  } finally {
    f.clean();
  }
});

test("failed deployment preflight leaves the pinned worker unchanged", () => {
  const f = fixture();
  try {
    const pinned =
      '/* RUSUTSU_MAP_SW_ROLLBACK_COMPATIBLE */\nconst worker = "previous";\n';
    writeFileSync(path.join(f.stateRoot, "map-sw.js"), pinned, { mode: 0o644 });
    const result = f.run("deploy.sh", { OPS_TEST_FAILURE: "connection" });
    assert.notEqual(result.status, 0);
    assert.equal(
      readFileSync(path.join(f.stateRoot, "map-sw.js"), "utf8"),
      pinned,
    );
    assert.ok(
      !readdirSync(f.stateRoot).some(name =>
        name.startsWith("map-sw.js.stage."),
      ),
    );
    assert.doesNotMatch(f.calls(), / stop |migrate deploy/);
  } finally {
    f.clean();
  }
});

test("deployment refuses a directory at the pinned worker path", () => {
  const f = fixture();
  try {
    mkdirSync(path.join(f.stateRoot, "map-sw.js"));
    const result = f.run("deploy.sh");
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /regular file/);
    assert.doesNotMatch(f.calls(), /docker pull| stop /);
  } finally {
    f.clean();
  }
});

test("initialization migrates/imports and records only after readiness", () => {
  const f = fixture();
  try {
    const result = f.run("deploy.sh", { INITIALIZE_CANONICAL_DATA: "true" });
    assert.equal(result.status, 0, result.stderr);
    const positions = [
      "check-existing-database.ts",
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

for (const failure of [
  "readiness",
  "migration",
  "canonical-maps",
  "worker-mismatch",
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
