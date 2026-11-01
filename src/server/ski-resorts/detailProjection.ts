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
