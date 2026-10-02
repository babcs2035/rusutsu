"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  EDIT_KIND_LABELS,
  type EditPlan,
  REQUEST_STATUS_LABELS,
} from "@/server/edit-requests/contract";
import type { getEditRequest } from "@/server/edit-requests/repository";
import {
  approveEditRequest,
  rejectEditRequest,
  saveRequestCandidate,
  withdrawEditRequest,
} from "./actions";
import { changeRows } from "./diff";
import { fieldLabel, ValueFields } from "./ValueFields";

const RequestMap = dynamic(() => import("./RequestMap"), { ssr: false });

function PlanDiff({ plan }: { plan: EditPlan }) {
  const groups = plan.documents.map(document => ({
    key: document.key,
    rows: changeRows(
      JSON.parse(
        plan.beforeDocuments.find(item => item.key === document.key)?.document
          ?.content ?? "null",
      ),
      JSON.parse(document.content),
    ),
  }));
  const resort = plan.resort;
  if (resort)
    groups.push({
      key: "スキー場マスター",
      rows: changeRows(
        Object.fromEntries(
          Object.keys(resort.request.data).map(key => [
            key,
            (resort.before as unknown as Record<string, unknown>)[key],
          ]),
        ),
        resort.request.data,
      ),
    });
  if (plan.ticket)
    groups.push({
      key: "リフト券",
      rows: changeRows(
        plan.ticket.before?.data ?? null,
        plan.ticket.write.data,
      ),
    });
  return (
    <div className="space-y-3">
      <RequestMap plan={plan} />
      {groups.map(group => (
        <details key={group.key} className="rounded border p-3" open>
          <summary className="font-medium break-all">
            {group.key}（差分 {group.rows.length}
            {group.rows.length === 300 ? "件以上" : "件"}）
          </summary>
          {group.rows.length === 300 && (
            <p className="text-sm">
              表示は先頭300件です。下の内容確認で全項目を確認できます。
            </p>
          )}
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="p-2 text-left">項目</th>
                  <th className="p-2 text-left">変更前</th>
                  <th className="p-2 text-left">反映する内容</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map(row => (
                  <tr key={row.path} className="border-t align-top">
                    <td className="p-2 break-all">
                      {row.path.split(".").map(fieldLabel).join(" / ")}
                    </td>
                    <td className="max-w-80 p-2 whitespace-pre-wrap break-words">
                      {row.before}
                    </td>
                    <td className="max-w-80 p-2 whitespace-pre-wrap break-words">
                      {row.after}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ))}
    </div>
  );
}
export function RequestDetail({
  request,
}: {
  request: Awaited<ReturnType<typeof getEditRequest>>;
}) {
  const router = useRouter();
  const [payload, setPayload] = useState<unknown>(
    request.candidatePayload ?? request.submittedPayload,
  );
  const [plan, setPlan] = useState(
    request.candidatePlan ?? request.submittedPlan,
  );
  const [version, setVersion] = useState(request.version);
  const [comment, setComment] = useState(request.comment ?? "");
  const [savedPayload, setSavedPayload] = useState(
    JSON.stringify(request.candidatePayload),
  );
  const [savedComment, setSavedComment] = useState(request.comment ?? "");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const dirty =
    JSON.stringify(payload) !== savedPayload || comment !== savedComment;
  const canReview = request.isAdmin && request.status === "PENDING";
  const act = (operation: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setMessage("");
      try {
        const result = await operation();
        if (result.ok) router.refresh();
        else {
          setMessage(result.error ?? "処理できませんでした。");
          router.refresh();
        }
      } catch {
        setMessage(
          "処理結果を確認できませんでした。再読み込みして最新の状態を確認してください。",
        );
      }
    });
  const save = () =>
    startTransition(async () => {
      setMessage("");
      try {
        const result = await saveRequestCandidate(
          request.id,
          version,
          payload,
          comment,
        );
        if (!result.ok) {
          setMessage(result.error);
          return;
        }
        setPlan(result.plan);
        setVersion(result.version);
        setSavedPayload(JSON.stringify(payload));
        setSavedComment(comment);
        setMessage(
          "修正内容の検証・保存が完了しました。差分を確認して反映してください。",
        );
      } catch {
        setMessage(
          "修正案を保存できませんでした。入力内容はこの画面に残っています。",
        );
      }
    });
  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4 md:p-8">
      <Link className="underline" href="/admin/requests">
        申請一覧へ戻る
      </Link>
      <h1 className="text-2xl font-bold">
        {EDIT_KIND_LABELS[request.kind]}の申請
      </h1>
      <p>
        {request.resortId} ／ {request.authorName} ／{" "}
        {new Date(request.createdAt).toLocaleString("ja-JP", {
          timeZone: "Asia/Tokyo",
        })}
      </p>
      <p className="font-semibold" role="status">
        {REQUEST_STATUS_LABELS[request.status]}
      </p>
      {request.resolvedAt && (
        <p>
          処理日時:{" "}
          {new Date(request.resolvedAt).toLocaleString("ja-JP", {
            timeZone: "Asia/Tokyo",
          })}
        </p>
      )}
      {!request.isAdmin && (
        <>
          {request.status === "PENDING" && (
            <p>管理者の確認後に反映されます。</p>
          )}
          {request.comment && (
            <p className="whitespace-pre-wrap">
              管理者のコメント: {request.comment}
            </p>
          )}
          {request.status === "PENDING" && (
            <Button
              disabled={pending}
              variant="outline"
              onClick={() =>
                act(() => withdrawEditRequest(request.id, request.version))
              }
            >
              申請を取り下げる
            </Button>
          )}
        </>
      )}
      {request.isAdmin && plan && (
        <>
          <h2 className="text-lg font-bold">変更前と反映する内容</h2>
          <PlanDiff plan={plan} />
          <details className="rounded border p-3">
            <summary>編集者が提出した内容を確認</summary>
            <ValueFields value={request.submittedPayload} />
          </details>
          {canReview ? (
            <>
              <h2 className="text-lg font-bold">申請内容を修正</h2>
              <p className="text-sm">
                必要な項目を修正して「修正内容を検証・保存」を押してください。保存しただけでは公開されません。
              </p>
              <ValueFields
                value={payload}
                onChange={setPayload}
                disabled={pending}
              />
              <label className="block space-y-2">
                <span>編集者へのコメント（却下時は必須）</span>
                <textarea
                  className="block w-full rounded border p-3"
                  maxLength={2000}
                  value={comment}
                  disabled={pending}
                  onChange={event => setComment(event.target.value)}
                />
              </label>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  disabled={pending || !dirty}
                  onClick={save}
                >
                  修正内容を検証・保存
                </Button>
                <Button
                  disabled={pending || dirty}
                  onClick={() =>
                    act(() => approveEditRequest(request.id, version))
                  }
                >
                  承認して反映
                </Button>
                <Button
                  variant="destructive"
                  disabled={pending || !comment.trim()}
                  onClick={() =>
                    act(() => rejectEditRequest(request.id, version, comment))
                  }
                >
                  却下する
                </Button>
              </div>
              {dirty && (
                <p className="text-sm">
                  修正内容を検証・保存すると、承認できます。
                </p>
              )}
            </>
          ) : (
            <>
              <ValueFields value={payload} />
              {request.comment && (
                <p className="whitespace-pre-wrap">
                  コメント: {request.comment}
                </p>
              )}
            </>
          )}
        </>
      )}
      {!request.isAdmin && (
        <ValueFields value={request.submittedPayload} label="提出した内容" />
      )}
      {message && (
        <p role="status" className="whitespace-pre-wrap">
          {message}
        </p>
      )}
    </main>
  );
}
