import path from "node:path";
import { readCapabilityFile } from "@/features/latest-status-mapping/server/capabilityFiles";
import { prisma } from "@/lib/prisma";
import { canonicalMapsEnabled } from "./canonicalDocuments";

/** クローラーがブラウザーを閉じる前にDOM診断を判断するための、名称だけの基準。 */
export async function readOperationBaseline(resortId: string) {
  if (!(await canonicalMapsEnabled(prisma))) return { enabled: false as const };
  const where = { resortId, archivedAt: null, geometryType: "LineString" };
  const select = { id: true, crawledNames: true, mappingAssigned: true };
  const [courses, lifts, capability] = await Promise.all([
    prisma.mapCourse.findMany({ where, select }),
    prisma.mapLift.findMany({ where, select }),
    readCapabilityFile(
      path.join(process.cwd(), "src/private/data/resorts-temporary"),
      resortId,
    ),
  ]);
  return {
    enabled: true as const,
    courses: {
      rows: courses,
      listingMode: capability?.courses.listingMode ?? "complete",
    },
    lifts: {
      rows: lifts,
      listingMode: capability?.lifts.listingMode ?? "complete",
    },
  };
}
