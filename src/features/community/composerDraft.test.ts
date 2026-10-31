import assert from "node:assert/strict";
import { test } from "node:test";
import {
  composerDraftSchema,
  currentTokyoDateTime,
  geolocationMessage,
} from "./composerDraft";

const validIncompleteDraft = {
  report: {
    observedOn: "",
    observedTime: null,
    // Draft validation permits an unfinished course selection.
    entries: [
      {
        clientKey: "a6f51d0b-2c57-4e28-8e3d-e2c30e74dd65",
        kind: "COURSE",
        size: null,
      },
    ],
  },
  version: null,
  removedPhotoIds: [],
  idempotencyKey: "2f65a67e-28a0-4566-9ac2-77fcc938f6dd",
  timeEdited: false,
  locationEdited: false,
  targetEdited: false,
  liftSpeedText: "",
  kmhText: "",
};

test("currentTokyoDateTime uses Japan time across a UTC date rollover", () => {
  assert.deepEqual(currentTokyoDateTime(new Date("2026-12-31T15:30:00.000Z")), {
    observedOn: "2027-01-01",
    observedTime: "00:30",
  });
});

test("composer draft schema accepts incomplete inputs with valid structure", () => {
  const parsed = composerDraftSchema.safeParse(validIncompleteDraft);
  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal(parsed.data.photosMissing, false);
});

test("composer draft schema rejects forged or malformed persisted shapes", () => {
  const invalidId = structuredClone(validIncompleteDraft);
  invalidId.idempotencyKey = "forged-key";
  assert.equal(composerDraftSchema.safeParse(invalidId).success, false);

  const invalidEntry = structuredClone(validIncompleteDraft);
  const invalidEntryRow = invalidEntry.report.entries[0];
  assert.ok(invalidEntryRow);
  invalidEntryRow.kind = "ADMIN";
  assert.equal(composerDraftSchema.safeParse(invalidEntry).success, false);

  const invalidNumber = structuredClone(validIncompleteDraft);
  const invalidNumberRow = invalidNumber.report.entries[0];
  assert.ok(invalidNumberRow);
  Reflect.set(invalidNumberRow, "size", 99);
  assert.equal(composerDraftSchema.safeParse(invalidNumber).success, false);
});

test("geolocation errors map to permission, timeout, and fallback guidance", () => {
  assert.match(geolocationMessage(1), /許可されていません/);
  assert.match(geolocationMessage(3), /タイムアウト/);
  assert.match(geolocationMessage(2), /取得できませんでした/);
  assert.match(geolocationMessage(99), /取得できませんでした/);
});
