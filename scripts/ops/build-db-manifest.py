"""Fingerprint explicit DB-changing paths, including skipped/failed releases."""

import hashlib
import pathlib

root = pathlib.Path(__file__).resolve().parents[2]
paths = [root / "prisma/schema.prisma"]
paths += list((root / "prisma/migrations").rglob("*"))
paths += list((root / "scripts/backfills").rglob("*"))
paths += list((root / "scripts").glob("import*.ts"))
paths += list((root / "scripts").glob("canonicalImport*.ts"))
paths += [root / "src/server/data-documents/initialization.ts"]
digest = hashlib.sha256()
for path in sorted(path for path in paths if path.is_file() and not path.name.endswith(".test.ts")):
    digest.update(str(path.relative_to(root)).encode())
    digest.update(b"\0")
    digest.update(path.read_bytes())
    digest.update(b"\0")
print(digest.hexdigest())
