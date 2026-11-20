// PostgreSQL 上で同時取り込みと保存件数上限を検査する．
import assert from "node:assert/strict";
import { test } from "node:test";
import type { TrackAnalysis } from "@/features/ski-tracks/contract";
import { readTestDatabaseUrl } from "../../../scripts/testDatabase";

const analysis: TrackAnalysis = {
  version: 1,
  name: "Synthetic activity",
  declaredResort: null,
  start: "2026-01-01T00:00:00.000Z",
  finish: "2026-01-01T00:01:00.000Z",
  runs: 1,
  lifts: 0,
  distance: 50,
  vertical: 10,
  skiSeconds: 60,
  liftSeconds: 0,
  maxSpeed: 4,
  gpsDistance: 50,
  matchedDistance: 0,
  courses: [],
  segments: [],
};

test("parallel track imports enforce the per-owner cap and recognize an existing file", async () => {
  assert.ok(readTestDatabaseUrl());
  const { disconnectPrisma, prisma } = await import("@/lib/prisma");
  const { MAX_SAVED_TRACKS, saveAnalyzedTrack } = await import("./repository");
  try {
    const { id: userId } = await prisma.user.create({
      data: { id: "synthetic-track-owner" },
    });
    await prisma.skiTrackImport.createMany({
      data: Array.from({ length: MAX_SAVED_TRACKS - 1 }, (_, index) => ({
        userId,
        fileHash: `fixture-${index}`,
        fileName: "fixture.skiz",
        recordedAt: new Date(analysis.start),
        analysis,
      })),
    });
    const attempts = await Promise.all(
      ["new-a", "new-b"].map(hash =>
        saveAnalyzedTrack(userId, hash, "fixture.skiz", analysis),
      ),
    );
    assert.deepEqual(attempts.map(result => result.status).sort(), [
      "full",
      "saved",
    ]);
    assert.equal(
      await prisma.skiTrackImport.count({ where: { userId } }),
      MAX_SAVED_TRACKS,
    );
    const duplicate = await saveAnalyzedTrack(
      userId,
      "fixture-0",
      "fixture.skiz",
      analysis,
    );
    assert.ok(duplicate.status === "saved" && duplicate.duplicate);
  } finally {
    await disconnectPrisma();
  }
});
