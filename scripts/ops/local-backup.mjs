import { createHash } from "node:crypto";
import {
  chmodSync,
  createReadStream,
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
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

async function hashFile(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

function regular(file) {
  return (
    existsSync(file) &&
    lstatSync(file).isFile() &&
    !lstatSync(file).isSymbolicLink()
  );
}

export async function verifyGeneration(root, name) {
  if (!generationPattern.test(name))
    throw new Error("Invalid backup generation name.");
  const directory = path.join(root, name);
  if (
    !lstatSync(directory).isDirectory() ||
    lstatSync(directory).isSymbolicLink()
  )
    throw new Error("Invalid backup directory.");
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
    metadata.storage !== "vps-local"
  ) {
    throw new Error("Invalid backup metadata.");
  }
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
}

export async function finalize(root, incomplete, name) {
  if (
    !/^\.incomplete-[A-Za-z0-9]{8}$/.test(incomplete) ||
    !generationPattern.test(name)
  )
    throw new Error("Invalid backup path.");
  const directory = path.join(root, incomplete);
  if (
    !lstatSync(directory).isDirectory() ||
    lstatSync(directory).isSymbolicLink()
  )
    throw new Error("Invalid temporary directory.");
  for (const file of ["database.dump", "archive.list"]) {
    if (
      !regular(path.join(directory, file)) ||
      !lstatSync(path.join(directory, file)).size
    )
      throw new Error("Backup/archive is empty or invalid.");
    chmodSync(path.join(directory, file), 0o600);
  }
  const metadata = {
    generation: name,
    format: "postgresql-custom",
    storage: "vps-local",
    createdAt: new Date().toISOString(),
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
  const target = path.join(root, name);
  if (existsSync(target)) throw new Error("Backup generation already exists.");
  renameSync(directory, target);
  await verifyGeneration(root, name);
  await prune(root);
}

export async function prune(root, keep = 30, days = 7) {
  if (
    !Number.isInteger(keep) ||
    keep < 1 ||
    !Number.isInteger(days) ||
    days < 1
  )
    throw new Error("Invalid backup retention.");
  const valid = [];
  for (const name of readdirSync(root).sort().reverse()) {
    if (!generationPattern.test(name)) continue;
    try {
      await verifyGeneration(root, name);
      valid.push(name);
    } catch {
      // Preserve corrupt, incomplete, symlinked, and unrelated paths for review.
    }
  }
  for (const name of valid.slice(keep)) {
    const stamp = generationPattern.exec(name)[1];
    const date = Date.parse(
      `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(9, 11)}:${stamp.slice(11, 13)}:${stamp.slice(13, 15)}Z`,
    );
    if (date < Date.now() - days * 86400000)
      rmSync(path.join(root, name), { recursive: true });
  }
}

async function main() {
  try {
    const root = process.env.OPS_BACKUP_TEST_ROOT || "/operations/backups";
    if (process.argv[2] === "finalize")
      await finalize(root, process.argv[3], process.argv[4]);
    else if (process.argv[2] === "verify-latest") {
      const newest = readdirSync(root)
        .filter(name => generationPattern.test(name))
        .sort()
        .at(-1);
      if (!newest) throw new Error("No completed local backup exists.");
      await verifyGeneration(root, newest);
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
