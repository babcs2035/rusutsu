import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkImageRemoval,
  nextDeploymentRecord,
  selectImageCleanupPlan,
  verifyBeforeSwitch,
} from "./image-cleanup.ts";

const sha = "a".repeat(40);
const imageId = (letter: string) => `sha256:${letter.repeat(64)}`;
const digest = (letter: string) => `sha256:${letter.repeat(64)}`;
const repository = "ghcr.io/babcs2035/rusutsu";
const label = { "com.rusutsu.image-cleanup": "app" };

type FixtureImage = {
  Id: string;
  RepoTags: string[];
  RepoDigests?: string[];
  Config?: { Labels?: Record<string, string> };
};

function input() {
  const images: FixtureImage[] = [
    {
      Id: imageId("a"),
      RepoTags: [`${repository}:${sha}`],
      RepoDigests: [`${repository}@${digest("a")}`],
      Config: { Labels: label },
    },
    {
      Id: imageId("b"),
      RepoTags: [`${repository}:${"b".repeat(40)}`],
      RepoDigests: [`${repository}@${digest("b")}`],
      Config: { Labels: label },
    },
    {
      Id: imageId("c"),
      RepoTags: [`${repository}:${"c".repeat(40)}`],
      RepoDigests: [`${repository}@${digest("c")}`],
      Config: { Labels: label },
    },
    {
      Id: imageId("d"),
      RepoTags: ["postgres:16-alpine"],
    },
    {
      Id: imageId("e"),
      RepoTags: [`ghcr.io/another-project/rusutsu:${"e".repeat(40)}`],
      Config: { Labels: label },
    },
  ];
  return {
    requestedSha: sha,
    runningAppImageId: imageId("a"),
    deployment: {
      current: {
        repository,
        tag: sha,
        sha,
        imageId: imageId("a"),
        digest: digest("a"),
      },
      previous: {
        repository,
        tag: "b".repeat(40),
        sha: "b".repeat(40),
        imageId: imageId("b"),
        digest: digest("b"),
      },
    },
    images,
    containers: [{ Image: imageId("d") }],
  };
}

test("cleanup retains current, rollback, DB, and referenced images", () => {
  const plan = selectImageCleanupPlan(input());
  assert.deepEqual(plan.tagRemovals, [
    { tag: `${repository}:${"c".repeat(40)}`, imageId: imageId("c") },
  ]);
});

test("cleanup retains multiply tagged images and same-label images from other repositories", () => {
  const value = input();
  const multiplyTagged = value.images[2];
  assert.ok(multiplyTagged);
  multiplyTagged.RepoTags = [
    `${repository}:${"c".repeat(40)}`,
    `${repository}:stable`,
  ];

  assert.deepEqual(selectImageCleanupPlan(value).tagRemovals, []);
});

test("cleanup protects an unreferenced database image by repository identity", () => {
  const value = input();
  value.containers = [];

  assert.deepEqual(selectImageCleanupPlan(value).tagRemovals, [
    { tag: `${repository}:${"c".repeat(40)}`, imageId: imageId("c") },
  ]);
});

test("cleanup refuses a running image that differs from the immutable record", () => {
  assert.throws(
    () =>
      selectImageCleanupPlan({ ...input(), runningAppImageId: imageId("f") }),
    /Running app image/,
  );
});

test("deploying the same image twice preserves the previous distinct rollback", () => {
  const { deployment } = input();
  assert.deepEqual(
    nextDeploymentRecord(deployment.current, deployment),
    deployment,
  );
});

test("exact image removal requires the approved ID to remain dangling and labeled", () => {
  const image = {
    Id: imageId("c"),
    RepoTags: ["<none>:<none>"],
    Config: { Labels: label },
  };
  assert.doesNotThrow(() => checkImageRemoval(imageId("c"), image));
  assert.throws(() => checkImageRemoval(imageId("f"), image), /approved/);
  assert.throws(
    () =>
      checkImageRemoval(imageId("c"), {
        ...image,
        RepoTags: [`${repository}:${"c".repeat(40)}`],
      }),
    /approved/,
  );
  assert.throws(
    () => checkImageRemoval(imageId("c"), image, [imageId("c")]),
    /approved/,
  );
});

test("pre-switch verification accepts the recorded image and flags a different running image", () => {
  const { deployment } = input();
  const recordedImage = {
    Id: imageId("a"),
    RepoTags: [`${repository}:${sha}`],
    RepoDigests: [`${repository}@${digest("a")}`],
    Config: { Labels: label },
  };

  assert.equal(
    verifyBeforeSwitch("f".repeat(40), deployment, imageId("a"), recordedImage),
    false,
  );
  assert.equal(
    verifyBeforeSwitch("f".repeat(40), deployment, imageId("f"), recordedImage),
    true,
  );
  assert.throws(
    () =>
      verifyBeforeSwitch("f".repeat(40), deployment, imageId("a"), {
        ...recordedImage,
        RepoDigests: [],
      }),
    /metadata/,
  );
});
