"""Exercise the real VPS-local backup scripts using ONLY disposable local DBs.

Usage: uv run --no-project scripts/ops/verify-local-backup.py --image LOCAL_RUSUTSU_IMAGE
The release image must already exist. No image push/pull is performed.
No existing DB, volume, API or external storage is accessed.
"""
import argparse
import fcntl
import hashlib
import json
import os
import pathlib
import shutil
import subprocess
import tempfile
import time
import uuid

parser = argparse.ArgumentParser()
parser.add_argument('--image', required=True)
args = parser.parse_args()
repo = pathlib.Path(__file__).resolve().parents[2]
tmp = repo / 'src/private/data/resorts-temporary/tmp'
tmp.mkdir(parents=True, exist_ok=True)
root = pathlib.Path(tempfile.mkdtemp(prefix='rusutsu-local-ops-', dir=tmp))
project = 'rusutsu-ops-test-' + uuid.uuid4().hex[:10]
containers = []


def docker(*argv, input=None, check=True):
    return subprocess.run(['docker', *argv], input=input, text=True, capture_output=True, check=check)


def script(name, check=True):
    result = subprocess.run(['bash', str(repo / 'scripts/ops' / name)], cwd=root, env=env, text=True, capture_output=True)
    if check and result.returncode:
        raise RuntimeError(name + ' failed: ' + result.stdout + result.stderr)
    return result


def wait_for_postgres(container, user, database):
    """Wait for the final TCP server, after initialization has completed."""
    for _ in range(60):
        if docker('exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', user,
                  '-d', database, check=False).returncode == 0:
            return
        time.sleep(1)
    raise RuntimeError('Disposable database failed to start.')


def snapshot(container: str, user: str, database: str) -> str:
    """Hash all tables under one snapshot without printing original values."""
    query = """
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT format(
  'SELECT %L, count(*), encode(sha256(convert_to(COALESCE(string_agg(row_to_json(t)::text, chr(10) ORDER BY row_to_json(t)::text COLLATE "C"), ''''), ''UTF8'')), ''hex'') FROM public.%I AS t',
  tablename, tablename
) FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename COLLATE "C"
\\gexec
COMMIT;
"""
    return docker('exec', '-i', container, 'psql', '-U', user, '-d', database,
                  '-Atq', '-v', 'ON_ERROR_STOP=1', input=query).stdout


try:
    docker('image', 'inspect', args.image)
    docker('image', 'inspect', 'postgres:16-alpine')
    secret = "literal-$UNSET-${UNSET}-$$-quotes'\"-backslash\\"
    compose_file = root / 'compose-env-check.json'
    compose_file.write_text(json.dumps({'services': {'envcheck': {
        'image': args.image, 'network_mode': 'none', 'entrypoint': ['node'],
        'environment': {'TEST_SECRET': '${OPS_ROUNDTRIP}'},
        'command': ['-e', 'process.stdout.write(require("node:crypto").createHash("sha256").update(process.env.TEST_SECRET).digest("hex"))'],
    }}}))
    roundtrip = subprocess.run(['docker', 'compose', '--env-file', '/dev/null', '-p', project, '-f', str(compose_file),
        'run', '--rm', '--no-deps', '--pull', 'never', 'envcheck'], env=dict(os.environ, OPS_ROUNDTRIP=secret), text=True, capture_output=True, check=True)
    assert roundtrip.stdout.strip() == hashlib.sha256(secret.encode()).hexdigest()
    print('PASS: literal dollars and quotes reach the real Compose container unchanged')
    db = project + '-db'
    app = project + '-app'
    database = 'rusutsu_test_90481'
    containers.append(docker('run', '-d', '--name', db, '--network', 'none', '--label', 'com.docker.compose.project=' + project,
        '--label', 'com.docker.compose.service=db', '--mount', 'type=tmpfs,destination=/var/lib/postgresql/data',
        '-e', 'POSTGRES_USER=local_test', '-e', 'POSTGRES_PASSWORD=disposable_only', '-e', 'POSTGRES_DB=' + database, 'postgres:16-alpine').stdout.strip())
    containers.append(docker('run', '-d', '--name', app, '--network', 'none', '--label', 'com.docker.compose.project=' + project,
        '--label', 'com.docker.compose.service=app', '--entrypoint', 'node', args.image, '-e', 'setTimeout(() => {}, 600000)').stdout.strip())
    wait_for_postgres(db, 'local_test', database)
    database_url = 'postgresql://local_test:disposable_only@127.0.0.1:5432/' + database
    release_command = ['run', '--rm', '--pull', 'never', '--network', 'container:' + db,
                       '-e', 'DATABASE_URL=' + database_url, '--entrypoint', 'node', args.image]
    migrate = ['node_modules/prisma/build/index.js', 'migrate', 'deploy']
    docker(*release_command, *migrate)
    sql = (repo / 'scripts' / 'testBrowserFixtures.sql').read_text() + '''
INSERT INTO edit_requests (
  id, "authorId", "authorName", kind, "resortId", version, "submittedPayload",
  "submittedPlan", "candidatePayload", "candidatePlan", "updatedAt"
) VALUES (
  'restore-edit-request', 'browser-test-admin', '試験用の投稿者', 'resort', 'rusutsu-resort',
  7, '{"name":null,"code":1}', '{}', '{"code":2,"name":null}', '{}', now()
);
'''
    docker('exec', '-i', db, 'psql', '-U', 'local_test', '-d', database, '-v', 'ON_ERROR_STOP=1', input=sql)
    before = snapshot(db, 'local_test', database)
    assert before
    docker(*release_command, *migrate)
    docker(*release_command, '--import', 'tsx', 'src/private/scripts/migrateCanonicalMaps.ts', '--deploy')
    assert snapshot(db, 'local_test', database) == before
    print('PASS: normal release DB commands preserve every existing row, including IDs, references and documents')
    preflight = ['run', '--rm', '--network', 'container:' + db,
        '--mount', 'type=bind,source=' + str(repo / 'scripts/ops/check-existing-database.ts') + ',target=/app/scripts/ops/check-existing-database.ts,readonly',
        '--entrypoint', 'node']
    good = docker(*preflight, '-e', 'DATABASE_URL=' + database_url, args.image, 'scripts/ops/check-existing-database.ts')
    assert 'reachable and nonempty' in good.stdout
    bad = docker(*preflight, '-e', 'DATABASE_URL=postgresql://local_test:disposable_only@localhost:5432/missing_database', args.image, 'scripts/ops/check-existing-database.ts', check=False)
    assert bad.returncode != 0 and 'No reset' in bad.stderr
    print('PASS: new app preflight accepts the populated test DB and rejects a missing DB')
    state = root / 'state'
    state.mkdir(mode=0o700)
    runtime = state / 'runtime.env.sh'
    runtime.write_text("export COMPOSE_PROJECT_NAME='" + project + "'\n")
    runtime.chmod(0o600)
    env = dict(os.environ, RUSUTSU_DB_CONTAINER=db, RUSUTSU_APP_CONTAINER=app,
               RUSUTSU_OPS_STATE_DIR=str(state), DEPLOY_TARGET=str(root))
    env.pop('APP_IMAGE', None)
    env.pop('RUSUTSU_SETTINGS_B64', None)
    result = script('backup-database.sh')
    assert 'Verified VPS-local database backup' in result.stdout
    print('PASS: actual pg_dump, pg_restore archive check and Node checksum generation on Docker')
    generations = list((root / 'backups').iterdir())
    assert len(generations) == 1
    files = sorted(p.name for p in generations[0].iterdir())
    assert files == ['SHA256SUMS', 'archive.list', 'database.dump', 'metadata.json']
    assert all(p.stat().st_mode & 0o077 == 0 for p in generations[0].iterdir())
    assert json.loads((generations[0] / 'metadata.json').read_text())['storage'] == 'vps-local'
    print('PASS: backup remains in the private local directory with restricted permissions')
    result = script('restore-backup-test.sh')
    assert 'Restore succeeded' in result.stdout
    print('PASS: actual pg_restore into a network-isolated tmpfs DB; disposable DB removed')
    # Verify both contents in an additional disposable restore before removing it.
    restored = docker('run', '-d', '--network', 'none', '--mount', 'type=tmpfs,destination=/var/lib/postgresql/data',
        '-e', 'POSTGRES_USER=verify', '-e', 'POSTGRES_PASSWORD=disposable_only', '-e', 'POSTGRES_DB=verify', 'postgres:16-alpine').stdout.strip()
    containers.append(restored)
    wait_for_postgres(restored, 'verify', 'verify')
    with (generations[0] / 'database.dump').open('rb') as dump:
        subprocess.run(['docker', 'exec', '-i', restored, 'pg_restore', '--exit-on-error', '--no-owner', '--no-privileges', '-U', 'verify', '-d', 'verify'], stdin=dump, check=True, capture_output=True)
    assert snapshot(restored, 'verify', 'verify') == before
    print('PASS: original values, IDs, references and photo bytes match the restored records')
    legacy_root = state / 'backups'
    legacy_root.mkdir(mode=0o700)
    legacy_generation = legacy_root / generations[0].name
    generations[0].rename(legacy_generation)
    result = script('backup-database.sh')
    assert 'Restore succeeded' in result.stdout
    assert not legacy_generation.exists()
    assert generations[0].is_dir()
    print('PASS: legacy generation is restored successfully before its original is removed')
    with (state / 'operation.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        assert script('backup-database.sh', check=False).returncode != 0
    assert len(list((root / 'backups').iterdir())) == 2
    print('PASS: a concurrent operation is rejected before making another dump')
    for generation in (root / 'backups').iterdir():
        with (generation / 'database.dump').open('ab') as dump:
            dump.write(b'corrupt')
    assert script('restore-backup-test.sh', check=False).returncode != 0
    assert snapshot(db, 'local_test', database) == before
    print('PASS: corrupt backup is rejected and the source test database remains unchanged')
finally:
    for container in reversed(containers):
        docker('rm', '-f', container, check=False)
    shutil.rmtree(root)
    print('Task-created test containers and files cleaned up; no existing volumes touched.')
