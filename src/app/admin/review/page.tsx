import type { Metadata } from "next";
import { ReviewEditClient } from "@/features/review/ReviewEditClient";
import {
  listReviewResorts,
  readReviewForEdit,
} from "@/features/review/server/reviewFiles";
import { getReviewResortName } from "@/features/reviews/resortName";
import { readSkiResortNames } from "@/lib/skiResortData";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "レビュー編集 | 管理画面",
};

export default async function ReviewEditPage() {
  const reviewResorts = await listReviewResorts();
  const databaseResorts = await readSkiResortNames(
    reviewResorts.map(resort => resort.resortId),
  );
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
    <ReviewEditClient
      resorts={resorts}
      initialResortId={initialResortId ?? null}
      initialData={initialData}
    />
  );
}
