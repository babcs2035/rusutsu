import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CorrectionReview } from "@/features/corrections/CorrectionReview";
import { prisma } from "@/lib/prisma";
import { readAdminSkiResorts } from "@/lib/skiResortData";
import {
  correctionLinkPlatform,
  correctionLinks,
} from "@/server/corrections/links";
import { getDataDocument } from "@/server/data-documents/client";
import { requireAdminPage } from "@/server/edit-requests/authPages";
import { featureIdentity } from "@/shared/course-lift/identity";

type Props = { params: Promise<{ requestId: string }> };
export default async function CorrectionDetailPage({ params }: Props) {
  await requireAdminPage();
  const { requestId } = await params;
  const request = await prisma.editRequest.findUnique({
    where: { id: requestId },
    include: {
      photos: {
        select: { id: true, mimeType: true, width: true, height: true },
      },
      events: { orderBy: { createdAt: "asc" } },
    },
  });
  if (request?.kind !== "public-correction") notFound();
  const payload = request.candidatePayload as {
    items?: Array<Record<string, unknown>>;
    comment?: string;
    context?: unknown;
  };
  const submitted = request.submittedPayload as {
    items?: Array<Record<string, unknown>>;
    context?: unknown;
    comment?: string;
  };
  const resorts = await readAdminSkiResorts();
  const resort = resorts.find(value => value.id === request.resortId);
  const mapKeys = new Set(
    (payload.items ?? [])
      .filter(item => item.targetKind === "slope" || item.targetKind === "lift")
      .map(
        item =>
          `resorts-temporary/${item.targetKind === "lift" ? "lift_before" : "slope_before"}/${request.resortId}.geojson`,
      ),
  );
  const docs = await Promise.all(
    [...mapKeys].map(async key => [key, await getDataDocument(key)] as const),
  );
  const byKey = new Map(docs.map(([key, document]) => [key, document]));
  const linksDoc = await getDataDocument("SkiResortLinks.json");
  const items: Array<Record<string, unknown>> = await Promise.all(
    (payload.items ?? []).map(async (item, index) => {
      let current: unknown = null;
      if (item.targetKind === "resort") {
        current = correctionLinkPlatform(String(item.field))
          ? correctionLinks(
              linksDoc?.content ?? null,
              request.resortId,
              String(item.field),
            )
          : resort?.[String(item.field) as keyof typeof resort];
      } else if (item.targetKind === "slope" || item.targetKind === "lift") {
        const key = `resorts-temporary/${item.targetKind === "lift" ? "lift_before" : "slope_before"}/${request.resortId}.geojson`;
        const document = byKey.get(key);
        if (document) {
          const data = JSON.parse(document.content) as {
            features?: Array<Record<string, unknown>>;
          };
          const feature = (data.features ?? []).find((value, featureIndex) => {
            const properties = value.properties as Record<
              string,
              unknown
            > | null;
            return (
              featureIdentity(properties, key, featureIndex) ===
                item.targetId || properties?.id === item.targetId
            );
          });
          current =
            item.field === "coordinates"
              ? (feature?.geometry as { coordinates?: unknown } | undefined)
                  ?.coordinates
              : (feature?.properties as Record<string, unknown> | undefined)?.[
                  String(item.field)
                ];
        }
      }
      const original = submitted.items?.[index];
      return { ...item, current, submittedProposed: original?.proposed };
    }),
  );
  const pending = await prisma.editRequest.findMany({
    where: {
      resortId: request.resortId,
      kind: "public-correction",
      status: "PENDING",
      id: { not: request.id },
    },
    select: { id: true, candidatePayload: true },
  });
  const competing = items.map(item => ({
    ...item,
    competingCount: pending.filter(other => {
      const otherItems =
        (other.candidatePayload as { items?: Array<Record<string, unknown>> })
          .items ?? [];
      return otherItems.some(
        value =>
          value.targetKind === item.targetKind &&
          value.targetId === item.targetId &&
          value.field === item.field &&
          !value.decision,
      );
    }).length,
  }));
  return (
    <main className="mx-auto max-w-4xl p-4">
      <Link
        className="text-sm text-blue-700 underline"
        href="/admin/corrections"
      >
        一覧へ戻る
      </Link>
      <h1 className="mt-3 text-xl font-bold">{request.resortId}の修正案</h1>
      <p className="text-sm text-slate-600">
        {request.authorName} · 状態: {request.status}
      </p>
      <p className="mt-2 whitespace-pre-wrap text-sm">{payload.comment}</p>
      <section className="mt-4 rounded border p-3">
        <h2 className="font-semibold">申請の詳細</h2>
        <p className="mt-2 text-sm">対象スキー場: {request.resortId}</p>
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-50 p-2 text-xs">
          {JSON.stringify(submitted.context ?? {}, null, 2)}
        </pre>
        <h3 className="mt-3 text-sm font-semibold">添付写真</h3>
        {request.photos.length ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {request.photos.map(photo => (
              <a
                key={photo.id}
                href={`/rusutsu/api/community/photos/${encodeURIComponent(photo.id)}`}
                target="_blank"
                rel="noreferrer"
              >
                <Image
                  src={`/rusutsu/api/community/photos/${encodeURIComponent(photo.id)}`}
                  alt="申請の添付写真"
                  width={112}
                  height={84}
                  unoptimized
                  className="h-20 w-28 rounded border object-cover"
                />
                <span className="sr-only">
                  {photo.mimeType} {photo.width}×{photo.height}
                </span>
              </a>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">添付なし</p>
        )}
      </section>
      <section className="mt-4 rounded border p-3">
        <h2 className="font-semibold">審査履歴</h2>
        <ol className="mt-2 space-y-2 text-sm">
          {request.events.map(event => (
            <li key={event.id} className="border-l-2 pl-2">
              <span>
                {event.createdAt.toLocaleString("ja-JP")} · {event.action}
              </span>
              <p className="text-xs text-slate-500">
                {event.actorId}{" "}
                {event.payload ? JSON.stringify(event.payload) : ""}
              </p>
            </li>
          ))}
        </ol>
      </section>
      <CorrectionReview
        requestId={request.id}
        version={request.version}
        status={request.status}
        items={competing}
      />
    </main>
  );
}
