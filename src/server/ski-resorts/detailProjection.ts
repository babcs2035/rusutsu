import type { Prisma } from "@prisma/client";
import {
  type PublicSkiResortRecord,
  publicSkiResortSchema,
  type publicSkiResortSelect,
} from "./publicProjection";

export const projectResort = (
  row: Prisma.SkiResortGetPayload<{ select: typeof publicSkiResortSelect }>,
): PublicSkiResortRecord =>
  publicSkiResortSchema.parse({
    ...row,
    courses: [
      ...row.courses,
      ...row.mergedMembers.flatMap(member => member.courses),
    ],
    lifts: [...row.lifts, ...row.mergedMembers.flatMap(member => member.lifts)],
    tickets: [
      ...row.tickets,
      ...row.mergedMembers.flatMap(member => member.tickets),
    ],
  });

type PublicResortRow = Prisma.SkiResortGetPayload<{
  select: typeof publicSkiResortSelect;
}>;

/**
 * 連携エリアの子として開いたときの詳細。名前・所在地・公式サイト・営業時間は
 * 開いたスキー場のもの、地図・コース・リフト・料金・集計は親のものを使う。
 */
const OWN_FIELDS = [
  "id",
  "nameJa",
  "nameEn",
  "shortName",
  "nameRuby",
  "formerNames",
  "prefecture",
  "town",
  "latitude",
  "longitude",
  "website",
  "weekdayOpen",
  "weekdayClose",
  "weekendOpen",
  "weekendClose",
  "timesComment",
  "yukiMagiId",
  "yukiMagi",
] as const satisfies readonly (keyof PublicSkiResortRecord)[];

export function projectLinkedResort(
  ownRow: PublicResortRow,
  areaRow: PublicResortRow,
): PublicSkiResortRecord {
  const own = projectResort(ownRow);
  const area = projectResort(areaRow);
  const order = new Map(
    areaRow.sourceResortIds.map((id, index) => [id, index]),
  );
  const members = areaRow.mergedMembers
    .filter(member => member.isActive)
    .sort(
      (a, b) =>
        (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    )
    .map(({ id, nameJa, shortName, latitude, longitude }) => ({
      id,
      nameJa,
      shortName,
      latitude,
      longitude,
    }));
  return {
    ...area,
    ...Object.fromEntries(OWN_FIELDS.map(key => [key, own[key]])),
    linkedArea: { id: area.id, nameJa: area.nameJa, members },
  } as PublicSkiResortRecord;
}
