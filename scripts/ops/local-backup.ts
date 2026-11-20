import { createHash } from "node:crypto";
import {
  chmodSync,
  constants,
  copyFileSync,
  createReadStream,
  existsSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statfsSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const generationPattern = /^rusutsu-db-(\d{8}T\d{6}Z)-[A-Za-z0-9]{8}$/;
const expectedFiles = [
  "SHA256SUMS",
  "archive.list",
  "database.dump",
  "metadata.json",
];

type BackupMetadata = {
  generation: string;
  format: "postgresql-custom";
  storage: "vps-local";
  createdAt: string;
};

/** Computes a SHA-256 digest without loading a dump into memory. */
async function hashFile(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

/** Rejects symlinks and non-directory backup roots. */
function assertDirectory(directory: string): void {
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error("Invalid backup directory.");
}

/** Checks that a backup member is a regular file, not a symlink. */
function regular(file: string): boolean {
  return (
    existsSync(file) &&
    lstatSync(file).isFile() &&
    !lstatSync(file).isSymbolicLink()
  );
}

/** Verifies a completed generation and returns its metadata. */
export async function verifyGeneration(
  root: string,
  name: string,
): Promise<BackupMetadata> {
  if (!generationPattern.test(name))
    throw new Error("Invalid backup generation name.");
  const directory = path.join(root, name);
  assertDirectory(directory);
  return verifyGenerationContents(directory, name);
}

/** Finalizes a complete dump atomically, verifies it, then applies retention. */
export async function finalize(
  root: string,
  incomplete: string,
  name?: string,
  completedAt?: string,
): Promise<string> {
  if (
    !/^\.incomplete-[A-Za-z0-9]{8}$/.test(incomplete) ||
    (name !== undefined && !generationPattern.test(name))
  )
    throw new Error("Invalid backup path.");
  const createdAt = completedAt ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(createdAt)))
    throw new Error("Invalid backup completion time.");
  const suffix = incomplete.slice(".incomplete-".length);
  const stamp = createdAt.replace(/[-:]/gu, "").replace(/\.\d{3}/u, "");
  const generation = name ?? `rusutsu-db-${stamp}-${suffix}`;
  if (!generationPattern.test(generation))
    throw new Error("Invalid backup generation name.");
  const directory = path.join(root, incomplete);
  assertDirectory(directory);
  for (const file of ["database.dump", "archive.list"]) {
    if (
      !regular(path.join(directory, file)) ||
      !lstatSync(path.join(directory, file)).size
    )
      throw new Error("Backup/archive is empty or invalid.");
    chmodSync(path.join(directory, file), 0o600);
  }
  const metadata = {
    generation,
    format: "postgresql-custom",
    storage: "vps-local",
    createdAt,
  };
  writeFileSync(
    path.join(directory, "metadata.json"),
    JSON.stringify(metadata),
    { mode: 0o600 },
  );
  const checksums = [];
  for (const file of ["database.dump", "archive.list", "metadata.json"])
    checksums.push(`${await hashFile(path.join(directory, file))}  ${file}\n`);
  writeFileSync(path.join(directory, "SHA256SUMS"), checksums.join(""), {
    mode: 0o600,
  });
  const target = path.join(root, generation);
  if (existsSync(target)) throw new Error("Backup generation already exists.");
  renameSync(directory, target);
  await verifyGeneration(root, generation);
  await prune(root);
  return generation;
}

/** Keeps the newest verified generations and leaves invalid entries for review. */
export async function prune(root: string, keep = 7): Promise<string[]> {
  if (!Number.isInteger(keep) || keep < 1)
    throw new Error("Invalid backup retention.");
  const valid = [];
  for (const name of readdirSync(root)) {
    if (!generationPattern.test(name)) continue;
    try {
      const metadata = await verifyGeneration(root, name);
      valid.push({ name, createdAt: Date.parse(metadata.createdAt) });
    } catch {
      // Preserve corrupt, incomplete, symlinked, and unrelated paths for review.
      console.warn("Skipping an invalid backup generation during retention.");
    }
  }
  valid.sort(
    (left, right) =>
      right.createdAt - left.createdAt || right.name.localeCompare(left.name),
  );
  for (const { name } of valid.slice(keep))
    rmSync(path.join(root, name), { recursive: true });
  return valid.slice(0, keep).map(({ name }) => name);
}

/** Copies verified generations without pruning or deleting their legacy sources. */
export async function migrateLegacyBackups(
  legacyRoot: string,
  targetRoot: string,
  preview = false,
): Promise<string[]> {
  if (path.resolve(legacyRoot) === path.resolve(targetRoot)) return [];
  if (!existsSync(legacyRoot)) return [];
  assertDirectory(legacyRoot);
  assertDirectory(targetRoot);
  const migrated = [];
  for (const name of readdirSync(legacyRoot)) {
    if (!generationPattern.test(name)) continue;
    const source = path.join(legacyRoot, name);
    let sourceMetadata: BackupMetadata;
    try {
      sourceMetadata = await verifyGeneration(legacyRoot, name);
    } catch {
      // Keep invalid and incomplete legacy entries untouched for inspection.
      console.warn("Leaving an invalid legacy backup generation in place.");
      continue;
    }

    const target = path.join(targetRoot, name);
    if (existsSync(target)) {
      const targetMetadata = await verifyGeneration(targetRoot, name);
      if (targetMetadata.createdAt !== sourceMetadata.createdAt)
        throw new Error("Conflicting backup generation exists at target.");
      for (const file of expectedFiles) {
        if (
          (await hashFile(path.join(legacyRoot, name, file))) !==
          (await hashFile(path.join(targetRoot, name, file)))
        )
          throw new Error("Conflicting backup generation exists at target.");
      }
      migrated.push(name);
      continue;
    }
    if (preview) {
      migrated.push(name);
      continue;
    }

    // 新規ダンプに先立って旧世代をコピーするときも，保存先の容量を使い切らない．
    const bytes = expectedFiles.reduce(
      (total, file) =>
        total + lstatSync(path.join(source, file), { bigint: true }).size,
      BigInt(0),
    );
    const { bavail, bsize } = statfsSync(targetRoot, { bigint: true });
    if (bytes > bavail * bsize)
      throw new Error(
        "Insufficient free space to copy a legacy backup generation.",
      );
    const temporary = mkdtempSync(
      path.join(targetRoot, ".migration-incomplete-"),
    );
    try {
      chmodSync(temporary, 0o700);
      for (const file of expectedFiles) {
        copyFileSync(
          path.join(source, file),
          path.join(temporary, file),
          constants.COPYFILE_EXCL,
        );
        chmodSync(path.join(temporary, file), 0o600);
      }
      await verifyGenerationContents(temporary, name);
      renameSync(temporary, target);
      await verifyGeneration(targetRoot, name);
      migrated.push(name);
    } finally {
      if (existsSync(temporary)) rmSync(temporary, { recursive: true });
    }
  }
  return migrated;
}

/** Removes a legacy source once the caller has restored the copy in isolation. */
export async function confirmLegacyBackup(
  legacyRoot: string,
  targetRoot: string,
  name: string,
): Promise<void> {
  const sourceMetadata = await verifyGeneration(legacyRoot, name);
  const targetMetadata = await verifyGeneration(targetRoot, name);
  if (targetMetadata.createdAt !== sourceMetadata.createdAt)
    throw new Error("Conflicting backup generation exists at target.");
  for (const file of expectedFiles) {
    if (
      (await hashFile(path.join(legacyRoot, name, file))) !==
      (await hashFile(path.join(targetRoot, name, file)))
    )
      throw new Error("Conflicting backup generation exists at target.");
  }
  rmSync(path.join(legacyRoot, name), { recursive: true });
}

/** Verifies the members and checksum metadata inside one generation. */
async function verifyGenerationContents(
  directory: string,
  name: string,
): Promise<BackupMetadata> {
  if (!generationPattern.test(name))
    throw new Error("Invalid backup generation name.");
  if (readdirSync(directory).sort().join() !== expectedFiles.join())
    throw new Error("Incomplete backup generation.");
  for (const file of expectedFiles) {
    if (!regular(path.join(directory, file)))
      throw new Error("Invalid backup member.");
  }
  const metadata = JSON.parse(
    readFileSync(path.join(directory, "metadata.json"), "utf8"),
  );
  if (
    metadata.generation !== name ||
    metadata.format !== "postgresql-custom" ||
    metadata.storage !== "vps-local" ||
    typeof metadata.createdAt !== "string" ||
    !Number.isFinite(Date.parse(metadata.createdAt))
  )
    throw new Error("Invalid backup metadata.");
  const sums = readFileSync(path.join(directory, "SHA256SUMS"), "utf8")
    .trim()
    .split("\n");
  if (sums.length !== 3) throw new Error("Invalid backup checksums.");
  for (const [index, file] of [
    "database.dump",
    "archive.list",
    "metadata.json",
  ].entries()) {
    if (
      sums[index] !== `${await hashFile(path.join(directory, file))}  ${file}`
    )
      throw new Error("Backup checksum mismatch.");
  }
  if (!lstatSync(path.join(directory, "database.dump")).size)
    throw new Error("Backup is empty.");
  return metadata as BackupMetadata;
}

/** Runs the requested backup operation using the mounted private roots. */
async function main() {
  try {
    const root = process.env.OPS_BACKUP_TEST_ROOT || "/backup";
    if (process.argv[2] === "finalize") {
      const generation = await finalize(root, process.argv[3], process.argv[4]);
      console.log(generation);
    } else if (["migrate-legacy", "plan-legacy"].includes(process.argv[2])) {
      const migrated = await migrateLegacyBackups(
        process.env.OPS_BACKUP_LEGACY_TEST_ROOT || "/operations/backups",
        root,
        process.argv[2] === "plan-legacy",
      );
      for (const name of migrated) console.log(name);
    } else if (process.argv[2] === "confirm-legacy") {
      await confirmLegacyBackup(
        process.env.OPS_BACKUP_LEGACY_TEST_ROOT || "/operations/backups",
        root,
        process.argv[3],
      );
    } else if (process.argv[2] === "verify-latest") {
      const candidates = [];
      for (const name of readdirSync(root)) {
        if (!generationPattern.test(name)) continue;
        try {
          const metadata = await verifyGeneration(root, name);
          candidates.push({ name, createdAt: Date.parse(metadata.createdAt) });
        } catch {
          // Ignore invalid generations without deleting or restoring them.
          console.warn("Ignoring an invalid backup generation during lookup.");
        }
      }
      candidates.sort(
        (left, right) =>
          right.createdAt - left.createdAt ||
          right.name.localeCompare(left.name),
      );
      const newest = candidates[0]?.name;
      if (!newest) throw new Error("No completed local backup exists.");
      console.log(newest);
    } else throw new Error("Unknown local backup operation.");
  } catch {
    console.error(
      "Local backup verification failed; inspect the saved generation without resetting the DB.",
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  void main();
