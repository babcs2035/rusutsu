// 配備成功時のイメージ ID と digest を記録し，切り戻し前の照合に使う．
import { lstat, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const APP_REPOSITORY = "ghcr.io/babcs2035/rusutsu";
const CLEANUP_LABEL = "com.rusutsu.image-cleanup";
const IMAGE_ID_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const SHA_PATTERN = /^[a-f0-9]{40}$/u;
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const APP_DIGEST_PREFIX = `${APP_REPOSITORY}@`;

type DeploymentImage = {
  repository: string;
  tag: string;
  sha: string;
  imageId: string;
  digest: string;
};

type DeploymentRecord = {
  current: DeploymentImage;
  previous: DeploymentImage | null;
};

type InspectedImage = {
  Id?: string;
  RepoTags?: Array<string | null> | null;
  RepoDigests?: Array<string | null> | null;
  Config?: { Labels?: Record<string, string> | null } | null;
};

/** Verify the recorded rollback image against the app container before a switch. */
export function verifyBeforeSwitch(
  nextSha: string,
  deployment: DeploymentRecord,
  runningImageId: string,
  image: InspectedImage,
): boolean {
  if (!SHA_PATTERN.test(nextSha))
    throw new Error("Requested deployment SHA is invalid.");
  validateDeploymentImage(deployment.current, "current");
  if (deployment.previous)
    validateDeploymentImage(deployment.previous, "previous");
  if (image.Id !== deployment.current.imageId)
    throw new Error("Recorded app image metadata could not be reverified.");
  if (
    !(image.RepoTags ?? []).includes(
      `${APP_REPOSITORY}:${deployment.current.tag}`,
    ) ||
    !(image.RepoDigests ?? []).includes(
      `${APP_REPOSITORY}@${deployment.current.digest}`,
    ) ||
    image.Config?.Labels?.[CLEANUP_LABEL] !== "app"
  ) {
    throw new Error("Successful app image metadata could not be reverified.");
  }
  return runningImageId !== deployment.current.imageId;
}

/** 記録が当該リポジトリの完全な SHA と digest を持つことを検証する． */
function validateDeploymentImage(image: DeploymentImage, name: string): void {
  if (
    image.repository !== APP_REPOSITORY ||
    !SHA_PATTERN.test(image.sha) ||
    image.tag !== image.sha ||
    !IMAGE_ID_PATTERN.test(image.imageId) ||
    !DIGEST_PATTERN.test(image.digest)
  ) {
    throw new Error(`Successful ${name} image record is invalid.`);
  }
}

/** 同じイメージの再配備でも，実際に切り戻せる直前の別イメージを保持する． */
export function nextDeploymentRecord(
  current: DeploymentImage,
  existing: DeploymentRecord | null,
): DeploymentRecord {
  validateDeploymentImage(current, "current");
  if (!existing) return { current, previous: null };
  validateDeploymentImage(existing.current, "previous current");
  if (existing.previous) validateDeploymentImage(existing.previous, "previous");
  return {
    current,
    previous:
      existing.current.imageId === current.imageId
        ? existing.previous
        : existing.current,
  };
}

/** 操作ディレクトリの JSON 記録を読み込む． */
async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T;
}

/** Atomically persist the current immutable image while retaining rollback. */
async function recordDeployment(
  requestedSha: string,
  imageId: string,
  digest: string,
  directory: string,
): Promise<void> {
  const current: DeploymentImage = {
    repository: APP_REPOSITORY,
    tag: requestedSha,
    sha: requestedSha,
    imageId,
    digest,
  };
  const previousFile = path.join(directory, "previous-image.json");
  let existing: DeploymentRecord | null = null;
  try {
    existing = await readJson<DeploymentRecord>(previousFile);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const next = nextDeploymentRecord(current, existing);
  const temporary = path.join(directory, "deployed-image.json.tmp");
  await writeFile(temporary, `${JSON.stringify(next)}\n`, { mode: 0o600 });
  await rename(temporary, path.join(directory, "deployed-image.json"));
}

/** 配備スクリプトが使うイメージ記録コマンドを実行する． */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const [operation, requestedSha] = args;
  if (operation === "record" && requestedSha) {
    const [, , imageId, digest, directory] = args;
    if (directory !== "/operations")
      throw new Error("Deployment state path is invalid.");
    if (!imageId || !digest)
      throw new Error("Deployment image identity is incomplete.");
    await recordDeployment(requestedSha, imageId, digest, directory);
  } else if (operation === "recorded-image-id" && args[1] === "/operations") {
    const record = await readJson<DeploymentRecord>(
      path.join(args[1], "deployed-image.json"),
    );
    validateDeploymentImage(record.current, "current");
    console.log(record.current.imageId);
  } else if (operation === "verify-before-switch") {
    const nextSha = args[1];
    const directory = args[2];
    const runningImageId = args[3];
    const inspectedImage = args[4];
    if (
      !nextSha ||
      directory !== "/operations" ||
      !runningImageId ||
      !inspectedImage
    ) {
      throw new Error("Pre-switch image identity is incomplete.");
    }
    const recordPath = path.join(directory, "deployed-image.json");
    let recordStat: Awaited<ReturnType<typeof lstat>>;
    try {
      recordStat = await lstat(recordPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        console.log(
          "No successful deployment record exists; pre-switch verification skipped.",
        );
        return;
      }
      throw error;
    }
    if (!recordStat.isFile() || recordStat.isSymbolicLink())
      throw new Error("Successful deployment record is not a regular file.");
    const deployment = await readJson<DeploymentRecord>(recordPath);
    const runningDiffers = verifyBeforeSwitch(
      nextSha,
      deployment,
      runningImageId,
      JSON.parse(inspectedImage),
    );
    if (runningDiffers)
      console.error(
        "Warning: running app differs from the last successful deployment; the recorded image was verified and rollback remains available.",
      );
  } else throw new Error("Deployment image operation is invalid.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  void main().catch((error: unknown) => {
    console.error(
      error instanceof Error
        ? error.message
        : "Deployment image verification failed.",
    );
    process.exitCode = 1;
  });
