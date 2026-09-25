import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LiftTicketConflictError,
  type LiftTicketSeason,
  type LiftTicketSeasonWrite,
} from "@/server/lift-tickets/contract";
import type { ValidationReport } from "../types";
import {
  listTicketFiles,
  readTicketForEdit,
  type TicketSeasonClient,
  writeTicketFile,
} from "./ticketFiles";

const ticket = (resortId: string, seasonId: string, offers = 1) => ({
  resort: { id: resortId },
  season: { id: seasonId, label_ja: `${seasonId}シーズン` },
  offers: Array.from({ length: offers }, (_, index) => ({ id: `o${index}` })),
  data_quality: {
    status: "needs_review",
    human_review_required: [{}],
    unresolved_questions: [{}, {}],
  },
});

const season = (
  resortId: string,
  seasonId: string,
  version = 1,
  data: Record<string, unknown> = ticket(resortId, seasonId),
): LiftTicketSeason => ({
  resortId,
  seasonId,
  status: "needs_review",
  version,
  updatedAt: "2026-09-25T00:00:00.000Z",
  data,
});

class StubClient implements TicketSeasonClient {
  readonly seasons = new Map<string, LiftTicketSeason>();
  writes: LiftTicketSeasonWrite[] = [];
  writeError: unknown = null;

  add(value: LiftTicketSeason) {
    this.seasons.set(`${value.resortId}/${value.seasonId}`, value);
  }
  async listLiftTicketSeasons() {
    return [...this.seasons.values()].map(({ data: _data, ...summary }) => ({
      ...summary,
    }));
  }
  async findLiftTicketSeasons(resortIds: readonly string[]) {
    return [...this.seasons.values()].filter(value =>
      resortIds.includes(value.resortId),
    );
  }
  async getLiftTicketSeason(resortId: string, seasonId: string) {
    return this.seasons.get(`${resortId}/${seasonId}`) ?? null;
  }
  async writeLiftTicketSeason(write: LiftTicketSeasonWrite) {
    this.writes.push(write);
    if (this.writeError) throw this.writeError;
    return season(
      write.resortId,
      write.seasonId,
      (write.expectedVersion ?? 0) + 1,
      write.data,
    );
  }
}

const passed: ValidationReport = {
  ok: true,
  issues: [],
  failedToRun: null,
  checkedAt: "2026-09-25T00:00:00.000Z",
};

test("一覧はシーズンごとに件数と状態を要約する", async () => {
  const client = new StubClient();
  client.add(season("alpha-resort", "2025-2026"));
  client.add(
    season(
      "alpha-resort",
      "2026-2027",
      1,
      ticket("alpha-resort", "2026-2027", 3),
    ),
  );
  const summaries = await listTicketFiles(client);
  assert.deepEqual(
    summaries.map(summary => [
      summary.seasonId,
      summary.offerCount,
      summary.humanReviewCount,
      summary.unresolvedCount,
      summary.seasonLabelJa,
    ]),
    [
      ["2025-2026", 1, 1, 2, "2025-2026シーズン"],
      ["2026-2027", 3, 1, 2, "2026-2027シーズン"],
    ],
  );
});

test("編集読み込みはDBの版を返し、不正なIDは拒否する", async () => {
  const client = new StubClient();
  client.add(season("alpha-resort", "2025-2026", 4));
  const loaded = await readTicketForEdit("alpha-resort", "2025-2026", client);
  assert.equal(loaded.baseVersion, 4);
  await assert.rejects(readTicketForEdit("Bad", "2025-2026", client));
  await assert.rejects(readTicketForEdit("alpha-resort", "2025", client));
  await assert.rejects(readTicketForEdit("alpha-resort", "2024-2025", client));
});

test("保存は読み込んだ版を期待値にして書き、新しい版を返す", async () => {
  const client = new StubClient();
  const data = ticket("alpha-resort", "2025-2026");
  const result = await writeTicketFile(
    { resortId: "alpha-resort", seasonId: "2025-2026", data, baseVersion: 2 },
    client,
    async () => passed,
  );
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.data.baseVersion, 3);
  assert.deepEqual(client.writes, [
    {
      resortId: "alpha-resort",
      seasonId: "2025-2026",
      data,
      expectedVersion: 2,
    },
  ]);
});

test("版の競合は再読み込みエラーにし、検証エラーでは書き込まない", async () => {
  const client = new StubClient();
  client.writeError = new LiftTicketConflictError(5);
  const request = {
    resortId: "alpha-resort",
    seasonId: "2025-2026",
    data: ticket("alpha-resort", "2025-2026"),
    baseVersion: 4,
  };
  const conflict = await writeTicketFile(request, client, async () => passed);
  assert.equal(conflict.ok, false);
  assert.match(conflict.ok ? "" : conflict.errors[0], /再読み込み/);

  const invalid = new StubClient();
  const rejected = await writeTicketFile(request, invalid, async () => ({
    ...passed,
    ok: false,
  }));
  assert.equal(rejected.ok, false);
  assert.equal(invalid.writes.length, 0);
});
