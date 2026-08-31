import assert from "node:assert/strict";
import { test } from "node:test";
import { validateSaveRequest } from "./server/validateSaveRequest";
import type { SaveRequest } from "./types";

const createRequest = (): SaveRequest => ({
  resortId: "source-resort",
  sourceKind: "osm",
  fileHash: null,
  detailFileHash: null,
  courses: [
    {
      targetSkiId: "source-resort",
      properties: { name: "コース" },
      coordinates: [
        [139, 35],
        [139.001, 35.001],
      ],
      detail: {},
    },
  ],
  preservedFeatures: [],
  preservedDetails: [],
});

test("save request rejects an unknown source kind before selecting a folder", () => {
  const request = {
    ...createRequest(),
    sourceKind: "unknown",
  } as unknown as SaveRequest;

  assert.match(validateSaveRequest(request).join("\n"), /種類が不正/u);
});

test("verified curated courses cannot be reassigned", () => {
  const request = createRequest();
  request.sourceKind = "curated";
  request.courses[0].targetSkiId = "other-resort";

  assert.match(
    validateSaveRequest(request).join("\n"),
    /確認済みデータは別スキー場へ移動できません/u,
  );
});
