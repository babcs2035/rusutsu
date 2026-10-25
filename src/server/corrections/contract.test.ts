import assert from "node:assert/strict";
import { test } from "node:test";
import { submitCorrectionSchema } from "./contract";

const operationKey = "b067620d-1c63-47a5-93c8-46cb9564f947";

test("correction payload accepts a bounded coordinate change and ranges", () => {
  const result = submitCorrectionSchema.safeParse({
    operationKey,
    resortId: "test-resort",
    items: [
      {
        targetKind: "slope",
        targetId: "course-1",
        field: "coordinates",
        before: [
          [140, 40],
          [140.1, 40.1],
        ],
        proposed: [
          [140, 40],
          [140.2, 40.2],
        ],
      },
      {
        targetKind: "slope",
        targetId: "course-1",
        field: "pisteSegments",
        proposed: [{ from: 0, to: 0.5, value: "○" }],
      },
    ],
  });
  assert.equal(result.success, true);
});

test("correction payload rejects invalid coordinates and out-of-line ranges", () => {
  const invalidCoordinates = submitCorrectionSchema.safeParse({
    operationKey,
    resortId: "test-resort",
    items: [
      {
        targetKind: "slope",
        targetId: "course-1",
        field: "coordinates",
        proposed: [[181, 40]],
      },
    ],
  });
  const invalidRange = submitCorrectionSchema.safeParse({
    operationKey,
    resortId: "test-resort",
    items: [
      {
        targetKind: "slope",
        targetId: "course-1",
        field: "nightSegments",
        proposed: [{ from: 0.8, to: 0.2, value: "○" }],
      },
    ],
  });
  assert.equal(invalidCoordinates.success, false);
  assert.equal(invalidRange.success, false);
  assert.equal(
    submitCorrectionSchema.safeParse({
      operationKey,
      resortId: "test-resort",
      items: [
        {
          targetKind: "lift",
          targetId: "lift-1",
          field: "arbitrary-status",
          proposed: "○",
        },
      ],
    }).success,
    false,
  );
  assert.equal(
    submitCorrectionSchema.safeParse({
      operationKey,
      resortId: "test-resort",
      items: [
        {
          targetKind: "slope",
          targetId: "course-1",
          field: "nightSegments",
          proposed: [{ from: 0, to: 0.5, value: "△" }],
        },
      ],
    }).success,
    false,
  );
});
