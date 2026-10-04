"use client";
import { ArrowLeft, Check, ChevronRight, Pencil, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  EDIT_KIND_LABELS,
  type EditKind,
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
import { type ChangeRow, changeRows } from "./diff";
import { LiftRequestWorkspace } from "./LiftRequestWorkspace";
import { SlopeRequestWorkspace } from "./SlopeRequestWorkspace";
import { fieldLabel, ValueFields } from "./ValueFields";

const RequestMap = dynamic(() => import("./RequestMap"), { ssr: false });

const statusClass: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-800 ring-amber-200",
  APPLIED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  REJECTED: "bg-rose-50 text-rose-800 ring-rose-200",
  WITHDRAWN: "bg-slate-100 text-slate-700 ring-slate-200",
  CONFLICT: "bg-rose-50 text-rose-800 ring-rose-200",
};

function documentLabel(key: string) {
  if (key.includes("/slope_before")) return "コースの位置・情報";
  if (key.includes("/lift_before")) return "リフトの位置・情報";
  if (key.includes("latest_status_mapping")) return "営業情報との対応";
  if (key.includes("lift_detail")) return "リフトの詳細";
  if (key.includes("slope_detail")) return "コースの詳細";
  if (key.includes("/article.json")) return "レビュー記事";
  if (key.includes("/detail.json")) return "レビューの調査内容";
  if (key.includes("/links")) return "関連リンク";
  const filename = key.split("/").at(-1) ?? key;
  return filename.replace(/\.(geojson|json)$/u, "").replaceAll("_", " ");
}

function valuePreview(value: string) {
  if (value.length <= 180) return value;
  return `${value.slice(0, 180)}…`;
}

function isReadableChange(row: ChangeRow) {
  return !/(^|\.)(coordinates|geometry|@id|entityId|geometryId|fileHash|mappingFileHash|expectedHash|updatedAt)(\.|$)/u.test(
    row.path,
  );
}

function changeLabel(path: string, after: unknown) {
  const segments = path.split(".");
  return segments
    .map((segment, index) => {
      if (/^\d+$/u.test(segment)) {
        if (
          segments[index - 1] === "features" &&
          after &&
          typeof after === "object"
        ) {
          const feature = (
            after as {
              features?: Array<{
                properties?: { name?: unknown; nameJa?: unknown };
              }>;
            }
          ).features?.[Number(segment)];
          const name = feature?.properties?.nameJa ?? feature?.properties?.name;
          if (typeof name === "string" && name.trim()) return name;
        }
        return `${Number(segment) + 1}件目`;
      }
      return fieldLabel(segment);
    })
    .filter(segment => segment !== "features" && segment !== "properties")
    .join(" / ");
}

type ChangeGroup = {
  key: string;
  label: string;
  rows: ChangeRow[];
  preview: ChangeRow[];
  after: unknown;
  itemSummary: string | null;
  changedItems: string[];
  overview: string[];
};

const ticketSections: Record<string, string> = {
  season: "対象シーズン",
  audiences: "利用者区分",
  calendars: "利用日・期間",
  operating_hours: "営業時間",
  areas: "利用できるエリア",
  products: "券種",
  channels: "購入方法",
  offers: "料金",
  party_rules: "グループ利用の条件",
  fees: "追加料金",
  calculation_policy: "料金計算の条件",
  data_quality: "確認状況",
  sources: "参照元",
};

function ticketOverview(before: unknown, after: unknown): string[] {
  if (!after || typeof after !== "object" || Array.isArray(after)) return [];
  const previous =
    before && typeof before === "object" && !Array.isArray(before)
      ? (before as Record<string, unknown>)
      : {};
  return Object.entries(after as Record<string, unknown>)
    .filter(
      ([key, value]) =>
        key in ticketSections &&
        JSON.stringify(previous[key]) !== JSON.stringify(value),
    )
    .map(([key, value]) => {
      const oldValue = previous[key];
      if (Array.isArray(value))
        return `${ticketSections[key]}: ${Array.isArray(oldValue) ? oldValue.length : 0}件 → ${value.length}件`;
      return `${ticketSections[key]}を更新`;
    });
}

function groupChanges(plan: EditPlan): ChangeGroup[] {
  const groups: ChangeGroup[] = [];
  const add = (key: string, label: string, before: unknown, after: unknown) => {
    const rows = changeRows(before, after, 301);
    if (!rows.length) return;
    const beforeFeatures =
      before && typeof before === "object" && "features" in before
        ? (before as { features?: unknown }).features
        : null;
    const afterFeatures =
      after && typeof after === "object" && "features" in after
        ? (after as { features?: unknown }).features
        : null;
    const itemSummary = Array.isArray(afterFeatures)
      ? `登録件数 ${Array.isArray(beforeFeatures) ? beforeFeatures.length : 0}件 → ${afterFeatures.length}件`
      : null;
    const changedItems = Array.isArray(afterFeatures)
      ? afterFeatures
          .flatMap((item, index) => {
            if (
              JSON.stringify(item) ===
              JSON.stringify(
                Array.isArray(beforeFeatures)
                  ? beforeFeatures[index]
                  : undefined,
              )
            )
              return [];
            const feature = item as {
              properties?: { name?: unknown; nameJa?: unknown };
            };
            const name =
              feature?.properties?.nameJa ?? feature?.properties?.name;
            return [
              typeof name === "string" && name.trim()
                ? name
                : `${index + 1}件目`,
            ];
          })
          .slice(0, 5)
      : [];
    groups.push({
      key,
      label,
      rows,
      preview: rows.filter(isReadableChange).slice(0, 6),
      after,
      itemSummary,
      changedItems,
      overview: key === "ticket" ? ticketOverview(before, after) : [],
    });
  };
  for (const document of plan.documents) {
    const before = plan.beforeDocuments.find(
      item => item.key === document.key,
    )?.document;
    add(
      document.key,
      documentLabel(document.key),
      before ? JSON.parse(before.content) : null,
      JSON.parse(document.content),
    );
  }
  const resort = plan.resort;
  if (resort) {
    add(
      "resort",
      "スキー場の基本情報",
      Object.fromEntries(
        Object.keys(resort.request.data).map(key => [
          key,
          (resort.before as unknown as Record<string, unknown>)[key],
        ]),
      ),
      resort.request.data,
    );
  }
  if (plan.ticket)
    add(
      "ticket",
      "リフト券",
      plan.ticket.before?.data ?? null,
      plan.ticket.write.data,
    );
  return groups;
}

function submittedSummary(kind: EditKind, payload: unknown): string {
  if (!payload || typeof payload !== "object")
    return "提出した内容を下で確認できます。";
  const data = payload as Record<string, unknown>;
  const count = (key: string) =>
    Array.isArray(data[key]) ? data[key].length : null;
  switch (kind) {
    case "lift":
      return `リフト ${count("lifts") ?? 0}件のデータを提出しました。`;
    case "slope":
      return `コース ${count("courses") ?? 0}件のデータを提出しました。`;
    case "slope-order":
      return `コース ${count("orderedGeojsonNames") ?? 0}件の表示順を提出しました。`;
    case "links":
      return `関連リンク ${count("links") ?? 0}件の内容を提出しました。`;
    case "mapping":
      return `営業情報との対応 ${count("rows") ?? 0}件を提出しました。`;
    case "ticket":
      return `${typeof data.seasonId === "string" ? `${data.seasonId}シーズンの` : ""}リフト券料金を提出しました。`;
    case "review":
    case "review-import":
      return "レビューの調査内容と記事を提出しました。";
    case "resort":
      return "スキー場の基本情報の変更を提出しました。";
  }
}

function submittedHighlights(kind: EditKind, payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const data = payload as Record<string, unknown>;
  if (kind === "lift" || kind === "slope") {
    const items = data[kind === "lift" ? "lifts" : "courses"];
    if (!Array.isArray(items)) return [];
    return items
      .flatMap(item => {
        const name = item?.properties?.name;
        return typeof name === "string" && name.trim() ? [name] : [];
      })
      .slice(0, 5);
  }
  if (kind === "mapping" && Array.isArray(data.rows))
    return data.rows
      .flatMap(row =>
        typeof row?.geojsonName === "string" && row.geojsonName.trim()
          ? [row.geojsonName]
          : [],
      )
      .slice(0, 5);
  if (kind === "links" && Array.isArray(data.links))
    return data.links
      .flatMap(link => (typeof link?.url === "string" ? [link.url] : []))
      .slice(0, 3);
  if (kind === "ticket") {
    const ticket = data.data as Record<string, unknown> | undefined;
    const products = ticket?.products;
    const offers = ticket?.offers;
    return [
      Array.isArray(products) ? `券種 ${products.length}件` : null,
      Array.isArray(offers) ? `料金設定 ${offers.length}件` : null,
    ].filter((item): item is string => item !== null);
  }
  if (kind === "review" || kind === "review-import") {
    const article = data.article as Record<string, unknown> | undefined;
    return typeof article?.full === "string" && article.full.trim()
      ? [valuePreview(article.full)]
      : [];
  }
  return [];
}

function PlanSummary({ groups }: { groups: ChangeGroup[] }) {
  return (
    <section className="space-y-4" aria-labelledby="change-summary">
      <div>
        <h2 id="change-summary" className="text-lg font-bold text-slate-950">
          反映される変更
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {groups.length
            ? `${groups.length}項目のデータに変更があります。主な内容を下にまとめました。`
            : "データ上の差分はありません。"}
        </p>
      </div>
      {groups.map(group => (
        <article
          key={group.key}
          className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
        >
          <div className="border-b border-slate-100 px-5 py-4">
            <h3 className="font-semibold text-slate-900">{group.label}</h3>
            {group.itemSummary && (
              <p className="mt-1 text-sm text-slate-600">{group.itemSummary}</p>
            )}
            {group.changedItems.length > 0 && (
              <p className="mt-1 text-sm text-slate-600">
                変更した項目: {group.changedItems.join("、")}
                {group.changedItems.length === 5 && " ほか"}
              </p>
            )}
          </div>
          {group.overview.length > 0 && (
            <ul className="space-y-1 px-5 py-4 text-sm text-slate-800">
              {group.overview.map(item => (
                <li key={item}>・{item}</li>
              ))}
            </ul>
          )}
          {group.overview.length > 0 ? null : group.preview.length ? (
            <ul className="divide-y divide-slate-100">
              {group.preview.map(row => (
                <li
                  key={row.path}
                  className="grid gap-2 px-5 py-3 text-sm sm:grid-cols-[minmax(8rem,1fr)_minmax(0,2fr)]"
                >
                  <span className="font-medium text-slate-700">
                    {changeLabel(row.path, group.after)}
                  </span>
                  <span className="min-w-0 break-words text-slate-800">
                    <span className="text-slate-500 line-through">
                      {valuePreview(row.before)}
                    </span>
                    <ChevronRight
                      className="mx-1 inline size-3 text-slate-400"
                      aria-hidden="true"
                    />
                    <span className="font-medium">
                      {valuePreview(row.after)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-3 text-sm text-slate-600">
              地図上の位置・形状が変更されています。下の「地図と詳細な変更項目」で確認できます。
            </p>
          )}
          {group.rows.length > group.preview.length && (
            <p className="border-t border-slate-100 px-5 py-2 text-xs text-slate-500">
              残りの変更は「地図と詳細な変更項目」で確認できます。
            </p>
          )}
        </article>
      ))}
    </section>
  );
}

function PlanTechnical({
  plan,
  groups,
}: {
  plan: EditPlan;
  groups: ChangeGroup[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="rounded-xl border border-slate-200 bg-white p-5"
      onToggle={event => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer font-semibold text-slate-900">
        地図と詳細な変更項目を確認
      </summary>
      {open && (
        <div className="mt-5 space-y-4">
          <RequestMap plan={plan} />
          {groups.map(group => (
            <details
              key={group.key}
              className="rounded-lg border border-slate-200 p-4"
            >
              <summary className="cursor-pointer font-medium">
                {group.label}の変更をすべて見る
              </summary>
              {group.rows.length === 301 && (
                <p className="mt-2 text-sm text-amber-800">
                  差分表示は先頭300件です。内容全体は下の申請データで確認してください。
                </p>
              )}
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[38rem] text-left text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="p-2">項目</th>
                      <th className="p-2">変更前</th>
                      <th className="p-2">反映する内容</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.slice(0, 300).map(row => (
                      <tr key={row.path} className="border-b align-top">
                        <td className="p-2">
                          {changeLabel(row.path, group.after)}
                        </td>
                        <td className="max-w-80 whitespace-pre-wrap break-words p-2">
                          {row.before}
                        </td>
                        <td className="max-w-80 whitespace-pre-wrap break-words p-2">
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
      )}
    </details>
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
  const groups = useMemo(() => {
    if (!plan) return [];
    const internalPaths =
      request.kind === "lift"
        ? ["/lift_before/", "/lift_20m/", "/latest_status_mapping/"]
        : request.kind === "slope"
          ? [
              "/slope_before/",
              "/slope_before_osm/",
              "/slope_10m/",
              "/slope_10m_osm/",
              "/latest_status_mapping/",
            ]
          : null;
    if (!internalPaths) return groupChanges(plan);
    // 地図と一覧で確認できる線・対応表は、それ以外の変更の要約から外す
    const isInternalDocument = (key: string) =>
      internalPaths.some(path => key.includes(path));
    return groupChanges({
      ...plan,
      documents: plan.documents.filter(item => !isInternalDocument(item.key)),
      beforeDocuments: plan.beforeDocuments.filter(
        item => !isInternalDocument(item.key),
      ),
    });
  }, [plan, request.kind]);
  const [version, setVersion] = useState(request.version);
  const [comment, setComment] = useState(request.comment ?? "");
  const [savedPayload, setSavedPayload] = useState(
    JSON.stringify(request.candidatePayload ?? request.submittedPayload),
  );
  const [savedComment, setSavedComment] = useState(request.comment ?? "");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const dirty =
    JSON.stringify(payload) !== savedPayload || comment !== savedComment;
  const canReview = request.isAdmin && request.status === "PENDING";
  const highlights = submittedHighlights(
    request.kind,
    request.submittedPayload,
  );
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
        setEditing(false);
        setMessage(
          "修正内容を保存しました。変更の要点を確認してから承認してください。",
        );
      } catch {
        setMessage(
          "修正案を保存できませんでした。入力内容はこの画面に残っています。",
        );
      }
    });
  const resortName = request.resortName || request.resortId;
  const featureWorkspace = {
    resortName,
    authorName: request.authorName,
    createdAt: request.createdAt,
    status: REQUEST_STATUS_LABELS[request.status] ?? request.status,
    statusClass: statusClass[request.status] ?? statusClass.WITHDRAWN,
    plan: plan ?? undefined,
    payload,
    savedPayload: JSON.parse(savedPayload),
    editing,
    pending,
    onEdit: canReview ? () => setEditing(true) : undefined,
    // 修正案を保存してから開けば、編集画面は最新の申請内容から始まる
    fullEditorHref:
      canReview && !dirty
        ? `/admin/${request.kind}?request=${encodeURIComponent(request.id)}`
        : undefined,
    onPayloadChange: setPayload,
    message,
    extraContent: (
      <div className="space-y-3">
        {request.comment && !canReview && (
          <div className="rounded-lg bg-slate-50 p-3 text-sm">
            <h3 className="text-xs font-semibold text-slate-600">
              管理者からのコメント
            </h3>
            <p className="mt-1 whitespace-pre-wrap">{request.comment}</p>
          </div>
        )}
        {plan && request.isAdmin && groups.length > 0 && (
          <details className="rounded-lg border border-slate-200 p-3">
            <summary className="cursor-pointer text-xs font-medium">
              関連リンクなどの変更
            </summary>
            <div className="mt-3">
              <PlanSummary groups={groups} />
            </div>
          </details>
        )}
        <details className="rounded-lg border border-slate-200 p-3">
          <summary className="cursor-pointer text-xs text-slate-500">
            提出した内部データ
          </summary>
          <div className="mt-3">
            <ValueFields value={request.submittedPayload} />
          </div>
        </details>
      </div>
    ),
    footer: canReview ? (
      editing ? (
        <>
          <p className="text-xs text-slate-600">
            修正を保存してから、確認画面で承認できます。
          </p>
          <div className="flex gap-2">
            <Button
              className="h-9 flex-1"
              disabled={pending || !dirty}
              onClick={save}
            >
              {pending ? "保存中…" : "修正を保存して確認へ"}
            </Button>
            <Button
              className="h-9"
              variant="outline"
              disabled={pending}
              onClick={() => {
                setPayload(JSON.parse(savedPayload));
                setEditing(false);
              }}
            >
              修正を取り消す
            </Button>
          </div>
        </>
      ) : (
        <>
          <label className="block text-xs font-medium text-slate-600">
            申請者へのコメント{" "}
            <span className="font-normal">（却下時は必須）</span>
            <textarea
              className="mt-1 block w-full resize-none rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm"
              rows={2}
              maxLength={2000}
              value={comment}
              disabled={pending}
              onChange={event => setComment(event.target.value)}
              placeholder="確認結果や修正理由"
            />
          </label>
          <div className="flex gap-2">
            <Button
              className="h-9 flex-1"
              disabled={pending || dirty}
              onClick={() => act(() => approveEditRequest(request.id, version))}
            >
              <Check className="size-3.5" />
              承認して反映
            </Button>
            {dirty && (
              <Button
                className="h-9"
                variant="outline"
                disabled={pending}
                onClick={save}
              >
                コメントを保存
              </Button>
            )}
            <Button
              className="h-9"
              variant="outline"
              disabled={pending || !comment.trim()}
              onClick={() =>
                act(() => rejectEditRequest(request.id, version, comment))
              }
            >
              却下
            </Button>
          </div>
        </>
      )
    ) : !request.isAdmin && request.status === "PENDING" ? (
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-600">管理者の確認を待っています。</p>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            act(() => withdrawEditRequest(request.id, request.version))
          }
        >
          申請を取り下げる
        </Button>
      </div>
    ) : request.resolvedAt ? (
      <p className="text-xs text-slate-500">
        処理日時:{" "}
        {new Date(request.resolvedAt).toLocaleString("ja-JP", {
          timeZone: "Asia/Tokyo",
        })}
      </p>
    ) : undefined,
  };
  if (request.kind === "lift" && (plan || request.liftReview))
    return (
      <LiftRequestWorkspace
        {...featureWorkspace}
        submittedReview={request.liftReview}
        courseLines={request.courseLines ?? []}
      />
    );
  if (request.kind === "slope" && (plan || request.slopeReview))
    return (
      <SlopeRequestWorkspace
        {...featureWorkspace}
        submittedReview={request.slopeReview}
        liftLines={request.liftLines ?? []}
      />
    );
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 pb-12 md:p-8">
      <Link
        className="inline-flex items-center gap-1 text-sm text-slate-600 underline underline-offset-4"
        href="/admin/requests"
      >
        <ArrowLeft className="size-4" />
        申請一覧へ
      </Link>
      <header className="space-y-3">
        <span
          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusClass[request.status] ?? statusClass.WITHDRAWN}`}
        >
          {REQUEST_STATUS_LABELS[request.status] ?? request.status}
        </span>
        <div>
          <h1 className="text-2xl font-bold text-slate-950 md:text-3xl">
            {resortName}の{EDIT_KIND_LABELS[request.kind]}変更
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {request.authorName}さんが{" "}
            {new Date(request.createdAt).toLocaleString("ja-JP", {
              timeZone: "Asia/Tokyo",
            })}{" "}
            に申請
            {request.resortName && (
              <span className="ml-2">・ ID: {request.resortId}</span>
            )}
          </p>
        </div>
      </header>
      {request.comment && !canReview && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">管理者からのコメント</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm">{request.comment}</p>
        </section>
      )}
      {request.resolvedAt && (
        <p className="text-sm text-slate-600">
          処理日時:{" "}
          {new Date(request.resolvedAt).toLocaleString("ja-JP", {
            timeZone: "Asia/Tokyo",
          })}
        </p>
      )}
      {!request.isAdmin && request.status === "PENDING" && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
          管理者の確認を待っています。承認されると変更が反映されます。
        </section>
      )}
      {!request.isAdmin && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-900">提出した内容</h2>
          <p className="mt-2 text-sm text-slate-700">
            {submittedSummary(request.kind, request.submittedPayload)}
          </p>
          {highlights.length > 0 && (
            <p className="mt-2 break-words text-sm text-slate-600">
              {highlights.join("、")}
            </p>
          )}
        </section>
      )}
      {plan && request.isAdmin && <PlanSummary groups={groups} />}
      {canReview && (
        <section
          className="space-y-4 rounded-xl border border-slate-300 bg-white p-5 shadow-sm"
          aria-labelledby="review-actions"
        >
          <div>
            <h2 id="review-actions" className="text-lg font-bold">
              この申請をどうしますか？
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              内容を確認したら承認してください。修正する場合は、先に下の修正欄で保存します。
            </p>
          </div>
          <label className="block space-y-2 text-sm font-medium">
            <span>
              申請者へのコメント{" "}
              <span className="font-normal text-slate-500">
                （却下する場合は必須）
              </span>
            </span>
            <textarea
              className="block min-h-24 w-full rounded-lg border border-slate-300 p-3 font-normal"
              maxLength={2000}
              value={comment}
              disabled={pending}
              onChange={event => setComment(event.target.value)}
              placeholder="確認結果や修正理由を伝える場合に入力"
            />
          </label>
          {dirty && (
            <p className="text-sm text-amber-800">
              未保存の修正があります。承認する前に「修正内容を保存」を押してください。
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <Button
              className="h-10 px-4"
              disabled={pending || dirty}
              onClick={() => act(() => approveEditRequest(request.id, version))}
            >
              <Check className="size-4" />
              承認して反映
            </Button>
            <Button
              className="h-10 px-4"
              variant="destructive"
              disabled={pending || !comment.trim()}
              onClick={() =>
                act(() => rejectEditRequest(request.id, version, comment))
              }
            >
              <X className="size-4" />
              却下する
            </Button>
          </div>
        </section>
      )}
      {canReview && (
        <details className="rounded-xl border border-slate-200 bg-white p-5">
          <summary className="cursor-pointer font-semibold">
            <Pencil className="mr-2 inline size-4" />
            申請内容を修正する
          </summary>
          <p className="mt-3 text-sm text-slate-600">
            必要な項目だけ直し、保存してから変更の要点を確認してください。保存しただけでは反映されません。
          </p>
          <div className="mt-4">
            <ValueFields
              value={payload}
              onChange={setPayload}
              disabled={pending}
            />
          </div>
          <Button
            className="mt-4 h-10 px-4"
            variant="outline"
            disabled={pending || !dirty}
            onClick={save}
          >
            修正内容を保存
          </Button>
        </details>
      )}
      {request.isAdmin && plan && <PlanTechnical plan={plan} groups={groups} />}
      {request.isAdmin &&
        JSON.stringify(payload) !==
          JSON.stringify(request.submittedPayload) && (
          <details className="rounded-xl border border-slate-200 bg-white p-5">
            <summary className="cursor-pointer font-semibold">
              {dirty ? "編集中の修正案を見る" : "管理者の修正後のデータを見る"}
            </summary>
            <div className="mt-4">
              <ValueFields value={payload} />
            </div>
          </details>
        )}
      <details className="rounded-xl border border-slate-200 bg-white p-5">
        <summary className="cursor-pointer font-semibold">
          {request.isAdmin
            ? "申請者が提出した内部データを見る"
            : "提出した内部データを見る"}
        </summary>
        <div className="mt-4">
          <ValueFields value={request.submittedPayload} />
        </div>
      </details>
      {!request.isAdmin && request.status === "PENDING" && (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            act(() => withdrawEditRequest(request.id, request.version))
          }
        >
          申請を取り下げる
        </Button>
      )}
      {message && (
        <p
          role="status"
          className="whitespace-pre-wrap rounded-lg bg-slate-100 p-4 text-sm"
        >
          {message}
        </p>
      )}
    </main>
  );
}
