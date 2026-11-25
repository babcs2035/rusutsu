// 配備イメージの照合と切り戻し記録を検証する．
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  nextDeploymentRecord,
  verifyBeforeSwitch,
  verifyRollbackTarget,
} from "./deployment-image.ts";

const sha = "a".repeat(40);
const imageId = (letter: string) => `sha256:${letter.repeat(64)}`;
const digest = (letter: string) => `sha256:${letter.repeat(64)}`;
const repository = "ghcr.io/babcs2035/rusutsu";
const label = { "com.rusutsu.image-cleanup": "app" };

const deployment = {
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
};

test("deploying the same image twice preserves the previous distinct rollback", () => {
  assert.deepEqual(
    nextDeploymentRecord(deployment.current, deployment),
    deployment,
  );
});

test("pre-switch verification accepts the recorded image and flags a different running image", () => {
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

test("rollback verification accepts only the recorded previous image or retry target", () => {
  const previous = deployment.previous;
  assert.ok(previous);
  const inspected = (image: typeof previous) => ({
    Id: image.imageId,
    RepoTags: [`${repository}:${image.tag}`],
    RepoDigests: [`${repository}@${image.digest}`],
    Config: { Labels: label },
  });
  assert.doesNotThrow(() =>
    verifyRollbackTarget(previous.sha, deployment, inspected(previous)),
  );
  assert.doesNotThrow(() =>
    verifyRollbackTarget(sha, deployment, inspected(deployment.current)),
  );
  assert.throws(
    () => verifyRollbackTarget("f".repeat(40), deployment, inspected(previous)),
    /recorded previous/,
  );
  assert.throws(
    () =>
      verifyRollbackTarget(previous.sha, deployment, {
        ...inspected(previous),
        RepoDigests: [],
      }),
    /metadata/,
  );
});
