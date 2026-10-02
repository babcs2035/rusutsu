import Link from "next/link";
import { InternalDataApiError } from "@/lib/internalDataApiClient";
import { requireEditingPage } from "@/server/edit-requests/authPages";
import {
  EDIT_KIND_LABELS,
  type EditKind,
  REQUEST_STATUS_LABELS,
} from "@/server/edit-requests/contract";
import { listEditRequests } from "@/server/edit-requests/repository";
export const dynamic = "force-dynamic";
export default async function EditRequestsPage() {
  await requireEditingPage();
  let result: Awaited<ReturnType<typeof listEditRequests>>;
  try {
    result = await listEditRequests();
  } catch (error) {
    if (!(error instanceof InternalDataApiError)) throw error;
    return (
      <main className="p-8 space-y-3">
        <h1 className="text-2xl font-bold">編集申請</h1>
        <p role="alert">{error.message}</p>
        <Link className="underline" href="/admin">
          管理ダッシュボードへ
        </Link>
      </main>
    );
  }
  const { isAdmin, requests } = result;
  return (
    <main className="mx-auto max-w-6xl p-4 md:p-8 space-y-5">
      <Link href="/admin" className="underline">
        管理ダッシュボードへ
      </Link>
      <h1 className="text-2xl font-bold">
        {isAdmin ? "編集申請の確認・承認" : "自分の申請"}
      </h1>
      <p className="text-sm">
        最新200件を表示します。申請内容は管理者の確認後に反映されます。
      </p>
      {!requests.length && <p>申請はありません。</p>}
      <div className="overflow-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="p-3">申請日時</th>
              <th className="p-3">対象</th>
              <th className="p-3">種類</th>
              {isAdmin && <th className="p-3">申請者</th>}
              <th className="p-3">状態</th>
              <th className="p-3">確認</th>
            </tr>
          </thead>
          <tbody>
            {requests.map(request => (
              <tr key={request.id} className="border-t">
                <td className="p-3 whitespace-nowrap">
                  {new Date(request.createdAt).toLocaleString("ja-JP", {
                    timeZone: "Asia/Tokyo",
                  })}
                </td>
                <td className="p-3">{request.resortId}</td>
                <td className="p-3">
                  {EDIT_KIND_LABELS[request.kind as EditKind]}
                </td>
                {isAdmin && <td className="p-3">{request.authorName}</td>}
                <td className="p-3">{REQUEST_STATUS_LABELS[request.status]}</td>
                <td className="p-3">
                  <Link
                    className="underline"
                    href={`/admin/requests/${request.id}`}
                  >
                    内容を確認
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
