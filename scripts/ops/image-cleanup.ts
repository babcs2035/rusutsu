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

type InspectedContainer = {
  Image?: string;
  Config?: { Labels?: Record<string, string> | null } | null;
};

export type ImageCleanupPlanInput = {
  requestedSha: string;
  runningAppImageId: string;
  deployment: DeploymentRecord;
  images: InspectedImage[];
  containers: InspectedContainer[];
};

export type ImageCleanupPlan = {
  tagRemovals: Array<{ tag: string; imageId: string }>;
  removableImageIds: string[];
  warnings: string[];
};

/** Select only uniquely tagged old app images that no container or deployment record needs. */
export function selectImageCleanupPlan(
  input: ImageCleanupPlanInput,
): ImageCleanupPlan {
  const { requestedSha, runningAppImageId, deployment, images, containers } =
    input;
  if (!SHA_PATTERN.test(requestedSha))
    throw new Error("Requested deployment SHA is invalid.");
  validateDeploymentImage(deployment.current, "current");
  if (deployment.previous)
    validateDeploymentImage(deployment.previous, "previous");
  if (
    deployment.current.repository !== APP_REPOSITORY ||
    deployment.current.tag !== deployment.current.sha ||
    deployment.current.sha !== requestedSha
  ) {
    throw new Error(
      "Successful deployment SHA does not match the requested SHA.",
    );
  }
  if (runningAppImageId !== deployment.current.imageId)
    throw new Error(
      "Running app image does not match the successful deployment.",
    );

  const currentImages = images.filter(
    image => image.Id === deployment.current.imageId,
  );
  if (
    currentImages.length !== 1 ||
    !currentImages[0]?.RepoTags?.includes(
      `${APP_REPOSITORY}:${deployment.current.sha}`,
    ) ||
    !currentImages[0]?.RepoDigests?.includes(
      `${APP_REPOSITORY}@${deployment.current.digest}`,
    ) ||
    currentImages[0]?.Config?.Labels?.[CLEANUP_LABEL] !== "app"
  ) {
    throw new Error("Successful app image metadata could not be reverified.");
  }

  const warnings: string[] = [];
  const protectedImageIds = new Set<string>([
    deployment.current.imageId,
    ...(deployment.previous ? [deployment.previous.imageId] : []),
  ]);
  for (const container of containers) {
    if (container.Image && IMAGE_ID_PATTERN.test(container.Image))
      protectedImageIds.add(container.Image);
  }

  const occurrences = new Map<string, number>();
  for (const image of images) {
    if (!image.Id || !IMAGE_ID_PATTERN.test(image.Id)) {
      warnings.push(
        "An image has an invalid ID; image cleanup was restricted.",
      );
      continue;
    }
    occurrences.set(image.Id, (occurrences.get(image.Id) ?? 0) + 1);
    if (isDatabaseImage(image)) protectedImageIds.add(image.Id);
  }

  const tagRemovals: Array<{ tag: string; imageId: string }> = [];
  for (const image of images) {
    if (!image.Id || !IMAGE_ID_PATTERN.test(image.Id)) continue;
    const tags = (image.RepoTags ?? []).filter(
      (tag): tag is string =>
        typeof tag === "string" && tag !== "<none>:<none>",
    );
    if (
      occurrences.get(image.Id) !== 1 ||
      tags.length !== 1 ||
      protectedImageIds.has(image.Id)
    ) {
      continue;
    }
    const [repository, tag] = splitTag(tags[0] ?? "");
    if (
      repository !== APP_REPOSITORY ||
      !tag ||
      !SHA_PATTERN.test(tag) ||
      image.Config?.Labels?.[CLEANUP_LABEL] !== "app"
    ) {
      continue;
    }
    tagRemovals.push({ tag: tags[0] ?? "", imageId: image.Id });
  }

  tagRemovals.sort((left, right) => left.tag.localeCompare(right.tag));
  const previouslyDangling = images.flatMap(image => {
    const digests = image.RepoDigests ?? [];
    return image.Id &&
      occurrences.get(image.Id) === 1 &&
      !protectedImageIds.has(image.Id) &&
      (image.RepoTags ?? []).every(
        tag => tag == null || tag === "<none>:<none>",
      ) &&
      image.Config?.Labels?.[CLEANUP_LABEL] === "app" &&
      digests.length > 0 &&
      digests.every(isAppDigest)
      ? [image.Id]
      : [];
  });
  return {
    tagRemovals,
    removableImageIds: [
      ...tagRemovals.map(({ imageId }) => imageId),
      ...previouslyDangling,
    ].sort(),
    warnings: [...new Set(warnings)],
  };
}

/** Recheck one exact image ID immediately before a non-forced Docker removal. */
export function checkImageRemoval(
  expectedImageId: string,
  image: InspectedImage,
  protectedImageIds: string[] = [],
): void {
  if (
    !IMAGE_ID_PATTERN.test(expectedImageId) ||
    image.Id !== expectedImageId ||
    (image.RepoTags ?? []).some(
      tag => typeof tag === "string" && tag !== "<none>:<none>",
    ) ||
    (image.RepoDigests ?? []).some(
      digest => digest !== null && !isAppDigest(digest),
    ) ||
    image.Config?.Labels?.[CLEANUP_LABEL] !== "app" ||
    protectedImageIds.includes(expectedImageId)
  ) {
    throw new Error("Image is no longer an approved dangling app image.");
  }
}

/** ラベルに加えて配備リポジトリでの digest を確認する． */
function isAppDigest(value: string | null): boolean {
  return (
    value !== null &&
    value.startsWith(APP_DIGEST_PREFIX) &&
    DIGEST_PATTERN.test(value.slice(APP_DIGEST_PREFIX.length))
  );
}

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

function splitTag(value: string): [string, string | undefined] {
  const separator = value.lastIndexOf(":");
  return separator < 0
    ? [value, undefined]
    : [value.slice(0, separator), value.slice(separator + 1)];
}

function isDatabaseImage(image: InspectedImage): boolean {
  return [...(image.RepoTags ?? []), ...(image.RepoDigests ?? [])].some(
    value =>
      typeof value === "string" &&
      /(^|\/)(?:postgres|postgis)(?::|@|$)/u.test(value),
  );
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T;
}

/** Docker の整形出力を行単位で読み，空の候補一覧も扱う． */
async function readJsonLines<T>(file: string): Promise<T[]> {
  return (await readFile(file, "utf8"))
    .split("\n")
    .filter(Boolean)
    .map((line): T => JSON.parse(line));
}

/** Load Docker snapshots from the private operations directory and write a reviewed plan. */
async function planFromSnapshot(
  requestedSha: string,
  directory: string,
): Promise<void> {
  const deployment = await readJson<DeploymentRecord>(
    path.join(directory, "deployed-image.json"),
  );
  const images = await readJsonLines<InspectedImage>(
    path.join(directory, "images.jsonl"),
  );
  const containers = (
    await readJsonLines<string>(
      path.join(directory, "container-image-ids.jsonl"),
    )
  ).map(Image => ({ Image }));
  const runningAppImageId = (
    await readFile(path.join(directory, "running-app-image-id"), "utf8")
  ).trim();
  const plan = selectImageCleanupPlan({
    requestedSha,
    runningAppImageId,
    deployment,
    images,
    containers,
  });
  await writeFile(
    path.join(directory, "tag-removals.txt"),
    plan.tagRemovals.map(({ tag, imageId }) => `${tag}\t${imageId}\n`).join(""),
  );
  await writeFile(
    path.join(directory, "removable-image-ids.txt"),
    plan.removableImageIds.join("\n"),
  );
  console.log(`Eligible SHA tags: ${plan.tagRemovals.length}`);
  for (const warning of plan.warnings) console.error(`Warning: ${warning}`);
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
  } else if (operation === "plan" && requestedSha) {
    const directory = args[2];
    if (
      !directory ||
      !path.resolve(directory).startsWith("/operations/.cleanup-images-")
    )
      throw new Error("Cleanup snapshot path is invalid.");
    await planFromSnapshot(requestedSha, directory);
  } else if (operation === "check-id") {
    const expectedImageId = args[1];
    const inspectedImage = args[2];
    const directory = args[3];
    if (!expectedImageId || !inspectedImage || directory !== "/operations")
      throw new Error("Image removal identity is incomplete.");
    const deployment = await readJson<DeploymentRecord>(
      path.join(directory, "deployed-image.json"),
    );
    const containerImageIds = await readJsonLines<string>(
      path.join(directory, "container-image-ids.jsonl"),
    );
    checkImageRemoval(expectedImageId, JSON.parse(inspectedImage), [
      deployment.current.imageId,
      ...(deployment.previous ? [deployment.previous.imageId] : []),
      ...containerImageIds,
    ]);
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
  } else throw new Error("Cleanup helper operation is invalid.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  void main().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Image cleanup failed.",
    );
    process.exitCode = 1;
  });
