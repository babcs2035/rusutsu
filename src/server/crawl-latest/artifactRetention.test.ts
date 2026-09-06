import assert from "node:assert/strict";
import { test } from "node:test";
import {
  artifactRetentionCutoff,
  expireReferencedArtifacts,
} from "./artifactRetention";

test("retention defaults to 30 days and rejects invalid settings", () => {
  const now = Date.UTC(2026, 8, 5);
  assert.equal(
    artifactRetentionCutoff({}, now).getTime(),
    now - 30 * 86_400_000,
  );
  for (const setting of ["0", "-1", "NaN", "1.5", "3651"])
    assert.throws(() =>
      artifactRetentionCutoff(
        { CRAWLER_ARTIFACT_RETENTION_DAYS: setting },
        now,
      ),
    );
});

test("retention only expires selected old DOM references and leaves run metadata intact", async () => {
  const cutoff = new Date("2026-08-01T00:00:00Z");
  const expired: string[] = [];
  const count = await expireReferencedArtifacts(
    {
      async listExpired(actual, limit) {
        assert.equal(actual, cutoff);
        assert.equal(limit, 500);
        return [{ id: "old-dom", storageKey: "crawl_latest_dom/old.gz" }];
      },
      async expire(ids, actual) {
        assert.equal(actual, cutoff);
        expired.push(...ids);
        return ids.length;
      },
    },
    cutoff,
  );
  assert.equal(count, 1);
  assert.deepEqual(expired, ["old-dom"]);
});
