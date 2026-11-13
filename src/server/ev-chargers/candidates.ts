import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";

/** 調査データから作った「スキー場から1km以内の充電器」の候補。管理画面で選ぶときの参考に出す */
const plugSchema = z.object({
  kind: z.enum(["quick", "normal"]),
  kw: z.number().nullable(),
  count: z.number().int(),
  label: z.string(),
});
const candidateSchema = z.object({
  source: z.string(),
  name: z.string(),
  company: z.string().nullable(),
  distanceM: z.number(),
  url: z.string(),
  plugs: z.array(plugSchema),
  notes: z.string().nullable(),
});
const fileSchema = z.object({
  surveyDate: z.string(),
  radiusM: z.number(),
  resorts: z.record(z.string(), z.array(candidateSchema)),
});

export type EvChargerCandidate = z.infer<typeof candidateSchema>;
export type EvChargerCandidates = z.infer<typeof fileSchema>;

const CANDIDATES_PATH = path.join(
  process.cwd(),
  "src/private/data/ev-charging/admin-candidates.json",
);

/** ファイルが無い環境（調査データを入れていないとき）は null */
export async function readEvChargerCandidates(): Promise<EvChargerCandidates | null> {
  try {
    return fileSchema.parse(
      JSON.parse(await fs.readFile(CANDIDATES_PATH, "utf8")),
    );
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return null;
    throw error;
  }
}
