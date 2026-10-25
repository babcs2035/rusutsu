import Link from "next/link";
import { safeCorrectionReturnTo } from "@/features/corrections/returnTo";

type Props = {
  params: Promise<{ resortId: string }>;
  searchParams: Promise<{ id?: string; returnTo?: string }>;
};
export default async function CorrectionComplete({
  params,
  searchParams,
}: Props) {
  const [{ resortId }, query] = await Promise.all([params, searchParams]);
  const returnTo = safeCorrectionReturnTo(query.returnTo, resortId);
  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="text-lg font-bold">修正案を送信しました</h1>
      <p className="mt-2 text-sm text-slate-700">
        管理者が確認し、承認した内容だけが反映されます。
      </p>
      {query.id && (
        <p className="mt-3 text-xs text-slate-500">受付番号: {query.id}</p>
      )}
      <Link
        className="mt-5 inline-block text-sm text-blue-700 underline"
        href={returnTo}
      >
        元のページに戻る
      </Link>
      <Link
        className="ml-4 text-sm text-blue-700 underline"
        href={`/corrections/${resortId}?returnTo=${encodeURIComponent(returnTo)}`}
      >
        他の箇所も修正する
      </Link>
    </main>
  );
}
