import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const APP_REPOSITORY = "ghcr.io/babcs2035/rusutsu";
const CLEANUP_LABEL = "com.rusutsu.image-cleanup";
const IMAGE_ID_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const SHA_PATTERN = /^[a-f0-9]{40}$/u;
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;

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
  pruneEligibleImageIds: string[];
  warnings: string[];
};

export type PruneCheck = {
  allowed: boolean;
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
  return {
    tagRemovals,
    pruneEligibleImageIds: tagRemovals
      .filter(({ imageId }) =>
        images.some(
          image =>
            image.Id === imageId &&
            image.Config?.Labels?.[CLEANUP_LABEL] === "app",
        ),
      )
      .map(({ imageId }) => imageId)
      .sort(),
    warnings: [...new Set(warnings)],
  };
}

/** Allow prune only when every matching dangling image was identified before tag deletion. */
export function checkPruneCandidates(
  eligibleImageIds: string[],
  danglingImages: InspectedImage[],
): PruneCheck {
  const eligible = new Set(eligibleImageIds);
  const seen = new Set<string>();
  const warnings: string[] = [];
  for (const image of danglingImages) {
    const id = image.Id;
    if (
      !id ||
      !IMAGE_ID_PATTERN.test(id) ||
      seen.has(id) ||
      (image.RepoTags ?? []).some(
        tag => typeof tag === "string" && tag !== "<none>:<none>",
      ) ||
      image.Config?.Labels?.[CLEANUP_LABEL] !== "app" ||
      !eligible.has(id)
    ) {
      warnings.push(
        "Prune skipped because a dangling image was not proven removable for this deployment.",
      );
      return { allowed: false, warnings };
    }
    seen.add(id);
  }
  return { allowed: true, warnings };
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

/** Load Docker snapshots from the private operations directory and write a reviewed plan. */
async function planFromSnapshot(
  requestedSha: string,
  directory: string,
): Promise<void> {
  const deployment = await readJson<DeploymentRecord>(
    path.join(directory, "deployed-image.json"),
  );
  const images = await readJson<InspectedImage[]>(
    path.join(directory, "images.json"),
  );
  const containers = await readJson<InspectedContainer[]>(
    path.join(directory, "containers.json"),
  );
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
    plan.tagRemovals.map(({ tag, imageId }) => `${tag}\t${imageId}`).join("\n"),
  );
  await writeFile(
    path.join(directory, "prune-eligible-image-ids.txt"),
    plan.pruneEligibleImageIds.join("\n"),
  );
  console.log(`Eligible SHA tags: ${plan.tagRemovals.length}`);
  for (const warning of plan.warnings) console.error(`Warning: ${warning}`);
}

/** Check the post-removal dangling-image set against the preverified IDs. */
async function checkPruneFromSnapshot(directory: string): Promise<void> {
  const eligibleImageIds = (
    await readFile(path.join(directory, "prune-eligible-image-ids.txt"), "utf8")
  )
    .split("\n")
    .filter(Boolean);
  const danglingImages = await readJson<InspectedImage[]>(
    path.join(directory, "dangling-images.json"),
  );
  const check = checkPruneCandidates(eligibleImageIds, danglingImages);
  await writeFile(
    path.join(directory, "prune-approved"),
    check.allowed ? "yes\n" : "no\n",
  );
  for (const warning of check.warnings) console.error(`Warning: ${warning}`);
  if (check.allowed)
    console.log(`Verified dangling image candidates: ${danglingImages.length}`);
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
  validateDeploymentImage(current, "current");
  const previousFile = path.join(directory, "previous-image.json");
  let previous: DeploymentImage | null = null;
  try {
    const previousRecord = await readJson<DeploymentRecord>(previousFile);
    validateDeploymentImage(previousRecord.current, "previous current");
    previous = previousRecord.current;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const next: DeploymentRecord = { current, previous };
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
  } else if (operation === "check-prune") {
    const directory = args[1];
    if (
      !directory ||
      !path.resolve(directory).startsWith("/operations/.cleanup-images-")
    )
      throw new Error("Cleanup snapshot path is invalid.");
    await checkPruneFromSnapshot(directory);
  } else throw new Error("Cleanup helper operation is invalid.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  void main().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Image cleanup failed.",
    );
    process.exitCode = 1;
  });
