"""Exercise the real VPS-local backup scripts using ONLY disposable local DBs.

Usage: python3 scripts/ops/verify-local-backup.py --image LOCAL_NODE_IMAGE
The image must already exist and contain Node. No image push/pull is performed.
No existing DB, volume, API or external storage is accessed.
"""
import argparse
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
root = pathlib.Path(tempfile.mkdtemp(prefix='rusutsu-local-ops-', dir='/private/tmp' if pathlib.Path('/private/tmp').exists() else None))
project = 'rusutsu-ops-test-' + uuid.uuid4().hex[:10]
containers = []


def docker(*argv, input=None, check=True):
    return subprocess.run(['docker', *argv], input=input, text=True, capture_output=True, check=check)


def script(name, check=True):
    result = subprocess.run(['bash', str(repo / 'scripts/ops' / name)], cwd=root, env=env, text=True, capture_output=True)
    if check and result.returncode:
        raise RuntimeError(name + ' failed: ' + result.stdout + result.stderr)
    return result


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
    containers.append(docker('run', '-d', '--name', db, '--network', 'none', '--label', 'com.docker.compose.project=' + project,
        '--label', 'com.docker.compose.service=db', '--mount', 'type=tmpfs,destination=/var/lib/postgresql/data',
        '-e', 'POSTGRES_USER=local_test', '-e', 'POSTGRES_PASSWORD=disposable_only', '-e', 'POSTGRES_DB=local_test', 'postgres:16-alpine').stdout.strip())
    containers.append(docker('run', '-d', '--name', app, '--network', 'none', '--label', 'com.docker.compose.project=' + project,
        '--label', 'com.docker.compose.service=app', '--entrypoint', 'node', args.image, '-e', 'setTimeout(() => {}, 600000)').stdout.strip())
    for _ in range(60):
        if docker('exec', db, 'pg_isready', '-U', 'local_test', '-d', 'local_test', check=False).returncode == 0:
            break
        time.sleep(1)
    else:
        raise RuntimeError('Disposable database failed to start.')
    sql = '''CREATE TABLE ski_resorts (id text PRIMARY KEY, "nameJa" text NOT NULL);
INSERT INTO ski_resorts VALUES ('one','Sample One'), ('two','Sample Two');
CREATE TABLE retained_document (id integer PRIMARY KEY, content jsonb NOT NULL);
INSERT INTO retained_document VALUES (1, '{"text":"manual edit must survive"}');
'''
    docker('exec', '-i', db, 'psql', '-U', 'local_test', '-d', 'local_test', '-v', 'ON_ERROR_STOP=1', input=sql)
    preflight = ['run', '--rm', '--network', 'container:' + db,
        '--mount', 'type=bind,source=' + str(repo / 'scripts/ops/check-existing-database.mjs') + ',target=/app/scripts/ops/check-existing-database.mjs,readonly',
        '--entrypoint', 'node']
    good = docker(*preflight, '-e', 'DATABASE_URL=postgresql://local_test:disposable_only@localhost:5432/local_test', args.image, 'scripts/ops/check-existing-database.mjs')
    assert 'reachable and nonempty' in good.stdout
    bad = docker(*preflight, '-e', 'DATABASE_URL=postgresql://local_test:disposable_only@localhost:5432/missing_database', args.image, 'scripts/ops/check-existing-database.mjs', check=False)
    assert bad.returncode != 0 and 'No reset' in bad.stderr
    print('PASS: new app preflight accepts the populated test DB and rejects a missing DB')
    state = root / 'state'
    state.mkdir(mode=0o700)
    runtime = state / 'runtime.env.sh'
    runtime.write_text("export COMPOSE_PROJECT_NAME='" + project + "'\n")
    runtime.chmod(0o600)
    env = dict(os.environ, RUSUTSU_DB_CONTAINER=db, RUSUTSU_APP_CONTAINER=app, RUSUTSU_OPS_STATE_DIR=str(state))
    env.pop('APP_IMAGE', None)
    env.pop('RUSUTSU_SETTINGS_B64', None)
    result = script('backup-database.sh')
    assert 'Verified VPS-local database backup' in result.stdout
    print('PASS: actual pg_dump, pg_restore archive check and Node checksum generation on Docker')
    generations = list((state / 'backups').iterdir())
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
    for _ in range(60):
        if docker('exec', restored, 'pg_isready', '-U', 'verify', '-d', 'verify', check=False).returncode == 0:
            break
        time.sleep(1)
    with (generations[0] / 'database.dump').open('rb') as dump:
        subprocess.run(['docker', 'exec', '-i', restored, 'pg_restore', '--exit-on-error', '--no-owner', '--no-privileges', '-U', 'verify', '-d', 'verify'], stdin=dump, check=True, capture_output=True)
    rows = docker('exec', restored, 'psql', '-U', 'verify', '-d', 'verify', '-Atc', "SELECT content->>'text' FROM retained_document;").stdout.strip()
    assert rows == 'manual edit must survive'
    assert docker('exec', restored, 'psql', '-U', 'verify', '-d', 'verify', '-Atc', 'SELECT count(*) FROM ski_resorts;').stdout.strip() == '2'
    print('PASS: resort rows and a manually edited JSON document survive the real restore')
    lock = docker('run', '-d', '--name', 'rusutsu-operation-' + project, '--network', 'none', '--entrypoint', 'node', args.image,
        '-e', 'setTimeout(() => {}, 600000)').stdout.strip()
    containers.append(lock)
    assert script('backup-database.sh', check=False).returncode != 0
    assert len(list((state / 'backups').iterdir())) == 1
    docker('rm', '-f', lock)
    containers.remove(lock)
    print('PASS: a concurrent operation is rejected before making another dump')
    with (generations[0] / 'database.dump').open('ab') as dump:
        dump.write(b'corrupt')
    assert script('restore-backup-test.sh', check=False).returncode != 0
    assert docker('exec', db, 'psql', '-U', 'local_test', '-d', 'local_test', '-Atc', 'SELECT count(*) FROM ski_resorts;').stdout.strip() == '2'
    print('PASS: corrupt backup is rejected and the source test database remains unchanged')
finally:
    for container in reversed(containers):
        docker('rm', '-f', container, check=False)
    # Only remove a surviving lease bearing this unique test project name.
    lock = docker('inspect', '--format', '{{.Id}}', 'rusutsu-operation-' + project, check=False)
    if lock.returncode == 0:
        docker('rm', '-f', lock.stdout.strip(), check=False)
    shutil.rmtree(root)
    print('Task-created test containers and files cleaned up; no existing volumes touched.')
