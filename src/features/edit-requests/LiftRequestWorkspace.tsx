"use client";

import { ArrowLeft, Pencil } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { type ReactNode, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { LngLat } from "@/features/lift/types";
import type { EditPlan } from "@/server/edit-requests/contract";
import { type LiftEditorTab, LiftRequestEditor } from "./LiftRequestEditor";
import { LiftRequestReview } from "./LiftRequestReview";
import {
  candidateLiftId,
  liftCandidate,
  updateCandidateLift,
} from "./liftCandidate";
import { buildLiftReview, type LiftReview } from "./liftReview";
import type { RequestCourseLine } from "./mapContext";

const RequestMap = dynamic(() => import("./RequestMap"), { ssr: false });
const EditorMap = dynamic(
  () =>
    import("@/features/slope/components/EditorMap").then(
      module => module.EditorMap,
    ),
  { ssr: false },
);

export function LiftRequestWorkspace({
  resortName,
  authorName,
  createdAt,
  status,
  statusClass,
  plan,
  submittedReview,
  payload,
  savedPayload,
  courseLines,
  editing,
  pending,
  onEdit,
  onPayloadChange,
  footer,
  message,
  extraContent,
}: {
  resortName: string;
  authorName: string;
  createdAt: string;
  status: string;
  statusClass: string;
  plan?: EditPlan;
  submittedReview?: LiftReview | null;
  payload: unknown;
  savedPayload: unknown;
  courseLines: RequestCourseLine[];
  editing: boolean;
  pending: boolean;
  onEdit?: () => void;
  onPayloadChange: (payload: unknown) => void;
  footer?: ReactNode;
  message?: string;
  extraContent?: ReactNode;
}) {
  const candidate = useMemo(() => liftCandidate(payload), [payload]);
  const baseline = useMemo(() => liftCandidate(savedPayload), [savedPayload]);
  const review = useMemo(() => {
    const review = plan ? buildLiftReview(plan) : submittedReview;
    if (!review)
      return {
        items: [],
        changedCount: 0,
        mappingCount: 0,
        orderChanged: false,
      };
    if (!editing || !candidate) return review;
    return {
      ...review,
      items: review.items.map(item => {
        const lift = candidate.lifts.find(
          (lift, index) => candidateLiftId(candidate, lift, index) === item.id,
        );
        return lift
          ? {
              ...item,
              name: String(lift.properties.name || "名称未設定のリフト"),
            }
          : item;
      }),
    };
  }, [plan, submittedReview, candidate, editing]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    review.items.find(item => item.id === selectedId) ??
    review.items.find(item => item.status !== "unchanged") ??
    review.items[0];
  const [editorTab, setEditorTab] = useState<LiftEditorTab>("details");
  const [placingMidstation, setPlacingMidstation] = useState(false);
  const selectedLift = candidate?.lifts.find(
    (lift, index) => candidateLiftId(candidate, lift, index) === selected?.id,
  );
  const baselineLift = baseline?.lifts.find(
    (lift, index) => candidateLiftId(baseline, lift, index) === selected?.id,
  );
  const editableLines = useMemo(
    () =>
      candidate?.lifts.map((lift, index) => ({
        id: candidateLiftId(candidate, lift, index),
        name: String(lift.properties.name || "名称未設定のリフト"),
        coordinates: lift.coordinates,
      })) ?? [],
    [candidate],
  );
  const contextLines = useMemo(
    () => [
      ...courseLines.map((line, index) => ({
        id: `course-${index}`,
        name: line.name,
        coordinates: line.coordinates,
      })),
      ...(baselineLift
        ? [
            {
              id: "saved-position",
              name: "保存済みの位置",
              coordinates: baselineLift.coordinates,
            },
          ]
        : []),
    ],
    [courseLines, baselineLift],
  );
  const updateCoordinates = (update: (coordinates: LngLat[]) => LngLat[]) => {
    if (!candidate || !selected || pending) return;
    onPayloadChange(
      updateCandidateLift(candidate, selected.id, lift => ({
        ...lift,
        coordinates: update(lift.coordinates),
      })),
    );
  };
  const updateMidstation = (coordinates: LngLat) => {
    if (!candidate || !selected || pending) return;
    onPayloadChange(
      updateCandidateLift(candidate, selected.id, lift => ({
        ...lift,
        properties: { ...lift.properties, midstation: coordinates },
      })),
    );
    setPlacingMidstation(false);
  };
  const midstation = Array.isArray(selectedLift?.properties.midstation)
    ? (selectedLift.properties.midstation.slice(0, 2) as LngLat)
    : null;
  const selectLift = (id: string) => {
    if (!review.items.some(item => item.id === id)) return;
    setSelectedId(id);
    setPlacingMidstation(false);
  };

  return (
    <main className="admin-request-workspace flex h-dvh min-h-0 w-full flex-col overflow-hidden bg-white">
      <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
        <Link
          href="/admin/requests"
          aria-label="申請一覧へ戻る"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-sm font-bold text-slate-950 md:text-base">
              {resortName}のリフト変更
            </h1>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${statusClass}`}
            >
              {status}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-slate-500">
            {authorName}さんの申請 ·{" "}
            {new Date(createdAt).toLocaleString("ja-JP", {
              timeZone: "Asia/Tokyo",
            })}
          </p>
        </div>
        {onEdit && !editing && (
          <Button
            variant="outline"
            size="sm"
            disabled={pending || !candidate}
            onClick={() => {
              setEditorTab("details");
              onEdit();
            }}
          >
            <Pencil className="size-3.5" />
            編集する
          </Button>
        )}
        {editing && (
          <span className="shrink-0 rounded-md bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-900">
            申請内容を編集中
          </span>
        )}
      </header>
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(12rem,35%)_minmax(0,1fr)] md:grid-cols-[minmax(0,1fr)_minmax(26rem,42%)] md:grid-rows-1">
        <section
          aria-label="スキー場全体の地図"
          className="relative min-h-0 min-w-0 overflow-hidden border-b border-slate-200 md:border-r md:border-b-0"
        >
          {editing && editorTab === "geometry" && candidate && selectedLift ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="shrink-0 border-b border-blue-200 bg-blue-50 px-4 py-2 text-xs font-medium text-blue-900">
                {placingMidstation
                  ? "地図をクリックして中間駅を配置"
                  : `${selected?.name}の頂点をドラッグして位置を修正`}
              </div>
              <div className="min-h-0 flex-1">
                <EditorMap
                  center={selectedLift.coordinates[0] ?? [138, 36]}
                  zoom={12}
                  courses={editableLines}
                  backgroundLines={contextLines}
                  activeCourseId={selected?.id ?? null}
                  mode={
                    pending ? "view" : placingMidstation ? "midstation" : "edit"
                  }
                  googleMapsApiKey={null}
                  layerId="gsiPhoto"
                  fitBoundsKey={1}
                  fitBoundsToBackground
                  showTileSwitcher={false}
                  showLabels
                  onSelectCourse={selectLift}
                  onMoveVertex={(index, point) =>
                    updateCoordinates(coordinates =>
                      coordinates.map((original, i) =>
                        i === index ? point : original,
                      ),
                    )
                  }
                  onInsertVertex={(index, point) =>
                    updateCoordinates(coordinates => [
                      ...coordinates.slice(0, index),
                      point,
                      ...coordinates.slice(index),
                    ])
                  }
                  onDeleteVertex={index =>
                    updateCoordinates(coordinates =>
                      coordinates.length > 2
                        ? coordinates.filter((_, i) => i !== index)
                        : coordinates,
                    )
                  }
                  midstation={midstation}
                  onPlaceMidstation={updateMidstation}
                  onMoveMidstation={updateMidstation}
                />
              </div>
            </div>
          ) : (
            <RequestMap
              fill
              plan={plan}
              submittedPayload={payload}
              preferSubmittedPayload={editing}
              courseLines={courseLines}
              selectedId={selected?.id}
              onSelectLift={selectLift}
            />
          )}
        </section>
        <aside
          aria-label="申請の確認と編集"
          className="flex min-h-0 min-w-0 flex-col bg-white"
        >
          <LiftRequestReview
            review={review}
            selectedId={selected?.id ?? null}
            onSelect={selectLift}
            editor={
              editing && candidate && selected ? (
                <LiftRequestEditor
                  candidate={candidate}
                  item={selected}
                  tab={editorTab}
                  onTabChange={tab => {
                    setEditorTab(tab);
                    setPlacingMidstation(false);
                  }}
                  onChange={onPayloadChange}
                  disabled={pending}
                  placingMidstation={placingMidstation}
                  onPlaceMidstation={() =>
                    setPlacingMidstation(value => !value)
                  }
                  onResetGeometry={() => {
                    if (baselineLift)
                      updateCoordinates(() =>
                        baselineLift.coordinates.map(
                          point => [...point] as LngLat,
                        ),
                      );
                  }}
                />
              ) : undefined
            }
            extraContent={editing ? undefined : extraContent}
          />
          {(footer || message) && (
            <footer className="shrink-0 space-y-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
              {message && (
                <p
                  role="status"
                  className="max-h-20 overflow-y-auto whitespace-pre-wrap rounded-md bg-white px-3 py-2 text-xs text-slate-700"
                >
                  {message}
                </p>
              )}
              {footer}
            </footer>
          )}
        </aside>
      </div>
    </main>
  );
}
