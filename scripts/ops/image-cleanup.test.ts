import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkPruneCandidates,
  selectImageCleanupPlan,
} from "./image-cleanup.ts";

const sha = "a".repeat(40);
const imageId = (letter: string) => `sha256:${letter.repeat(64)}`;
const digest = (letter: string) => `sha256:${letter.repeat(64)}`;
const repository = "ghcr.io/babcs2035/rusutsu";
const label = { "com.rusutsu.image-cleanup": "app" };

function input() {
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
    images: [
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
    ],
    containers: [{ Image: imageId("d") }],
  };
}

test("cleanup retains current, rollback, DB, and referenced images", () => {
  const plan = selectImageCleanupPlan(input());
  assert.deepEqual(plan.tagRemovals, [
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

test("dangling prune requires every dangling image to be preverified", () => {
  const allowed = checkPruneCandidates(
    [imageId("c")],
    [
      {
        Id: imageId("c"),
        RepoTags: ["<none>:<none>"],
        Config: { Labels: label },
      },
    ],
  );
  assert.equal(allowed.allowed, true);
  const rejected = checkPruneCandidates(
    [imageId("c")],
    [
      {
        Id: imageId("f"),
        RepoTags: ["<none>:<none>"],
        Config: { Labels: label },
      },
    ],
  );
  assert.equal(rejected.allowed, false);
});
