import Link from "next/link";
import { ReviewJsonUpload } from "@/features/review/ReviewJsonUpload";
import { requireAdmin } from "@/lib/requireAdmin";
import { getDataDocument } from "@/server/data-documents/client";
import { skiResortIdSchema } from "@/server/ski-resorts/adminContract";

export const dynamic = "force-dynamic";
export default async function ReviewImportPage({
  searchParams,
}: {
  searchParams: Promise<{ resort?: string }>;
}) {
  await requireAdmin();
  const { resort } = await searchParams;
  const parsed = skiResortIdSchema.safeParse(resort);
  const documents = parsed.success
    ? await Promise.all(
        ["detail", "article"].map(kind =>
          getDataDocument(`reviews/${parsed.data}/${kind}.json`),
        ),
      )
    : [];
  const currentFiles = documents.flatMap(document =>
    document ? [{ key: document.key, content: document.content }] : [],
  );
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <Link href="/admin/review" className="underline">
        レビュー編集へ戻る
      </Link>
      <h1 className="text-2xl font-bold">レビューJSONの取り込み</h1>
      <ReviewJsonUpload currentFiles={currentFiles} />
    </main>
  );
}
