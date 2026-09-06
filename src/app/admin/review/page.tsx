import type { Metadata } from "next";
import Link from "next/link";
import { ReviewEditClient } from "@/features/review/ReviewEditClient";
import {
  listReviewResorts,
  readReviewForEdit,
} from "@/features/review/server/reviewFiles";
import { getReviewResortName } from "@/features/reviews/resortName";
import { requireAdmin } from "@/lib/requireAdmin";
import { readSkiResortNames } from "@/lib/skiResortData";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "レビュー編集 | 管理画面",
};

export default async function ReviewEditPage() {
  await requireAdmin();
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
  const formResorts = resorts.filter(resort => !resort.jsonOnly);
  const initialResortId = formResorts[0]?.resortId;
  const initialData = initialResortId
    ? await readReviewForEdit(initialResortId)
    : null;

  return (
    <>
      {resorts.some(resort => resort.jsonOnly) && (
        <details className="mx-6 my-2 rounded border p-3">
          <summary>AIで作成した形式のレビュー（JSONで確認・更新）</summary>
          <ul className="mt-2 flex flex-wrap gap-3">
            {resorts
              .filter(resort => resort.jsonOnly)
              .map(resort => (
                <li key={resort.resortId}>
                  <Link
                    className="underline"
                    href={`/admin/review/import?resort=${encodeURIComponent(resort.resortId)}`}
                  >
                    {resort.name}
                  </Link>
                </li>
              ))}
          </ul>
        </details>
      )}
      <div className="px-6 py-2 text-right">
        <Link href="/admin/review/import" className="text-sm underline">
          作成したJSONを取り込む（新規・更新）
        </Link>
      </div>
      <ReviewEditClient
        resorts={formResorts}
        initialResortId={initialResortId ?? null}
        initialData={initialData}
      />
    </>
  );
}
