import type { Metadata } from "next";
import { ReviewEditWorkspace } from "@/features/review-edit/ReviewEditWorkspace";
import {
  listReviewResorts,
  readReviewForEdit,
} from "@/features/review-edit/server/reviewFiles";
import { getReviewResortName } from "@/features/reviews/resortName";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "レビュー編集",
};

export default async function ReviewEditPage() {
  const reviewResorts = await listReviewResorts();
  const databaseResorts = await prisma.skiResort.findMany({
    where: {
      id: { in: reviewResorts.map(resort => resort.resortId) },
    },
    select: { id: true, nameJa: true },
  });
  const databaseNameById = new Map(
    databaseResorts.map(resort => [resort.id, resort.nameJa]),
  );
  const resorts = reviewResorts
    .map(resort => ({
      ...resort,
      name: getReviewResortName(
        resort.resortId,
        databaseNameById.get(resort.resortId),
      ),
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "ja"));
  const initialResortId = resorts[0]?.resortId;
  const initialData = initialResortId
    ? await readReviewForEdit(initialResortId)
    : null;

  return (
    <ReviewEditWorkspace
      resorts={resorts}
      initialResortId={initialResortId ?? null}
      initialData={initialData}
    />
  );
}
