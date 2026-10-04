"use client";

import dynamic from "next/dynamic";
import { type ReactNode, useMemo, useState } from "react";
import type { LngLat } from "@/features/slope/types";
import type { EditPlan } from "@/server/edit-requests/contract";
import type { RequestCourseLine } from "./mapContext";
import { RequestFeatureReview } from "./RequestFeatureReview";
import { RequestWorkspaceLayout } from "./RequestWorkspaceLayout";
import { type SlopeEditorTab, SlopeRequestEditor } from "./SlopeRequestEditor";
import {
  candidateCourseId,
  slopeCandidate,
  updateCandidateCourse,
} from "./slopeCandidate";
import { buildSlopeReview, type SlopeReview } from "./slopeReview";

const RequestMap = dynamic(() => import("./RequestMap"), { ssr: false });
const EditorMap = dynamic(
  () =>
    import("@/features/slope/components/EditorMap").then(
      module => module.EditorMap,
    ),
  { ssr: false },
);

export function SlopeRequestWorkspace({
  resortName,
  authorName,
  createdAt,
  status,
  statusClass,
  plan,
  submittedReview,
  payload,
  savedPayload,
  liftLines,
  editing,
  pending,
  onEdit,
  fullEditorHref,
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
  submittedReview?: SlopeReview | null;
  payload: unknown;
  savedPayload: unknown;
  liftLines: RequestCourseLine[];
  editing: boolean;
  pending: boolean;
  onEdit?: () => void;
  fullEditorHref?: string;
  onPayloadChange: (payload: unknown) => void;
  footer?: ReactNode;
  message?: string;
  extraContent?: ReactNode;
}) {
  const candidate = useMemo(() => slopeCandidate(payload), [payload]);
  const baseline = useMemo(() => slopeCandidate(savedPayload), [savedPayload]);
  const review = useMemo(() => {
    const review = plan ? buildSlopeReview(plan) : submittedReview;
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
        const course = candidate.courses.find(
          (course, index) =>
            candidateCourseId(candidate, course, index) === item.id,
        );
        return course
          ? {
              ...item,
              name: String(course.properties.name || "名称未設定のコース"),
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
  const [editorTab, setEditorTab] = useState<SlopeEditorTab>("details");
  const selectedCourse = candidate?.courses.find(
    (course, index) =>
      candidateCourseId(candidate, course, index) === selected?.id,
  );
  const baselineCourse = baseline?.courses.find(
    (course, index) =>
      candidateCourseId(baseline, course, index) === selected?.id,
  );
  const editableLines = useMemo(
    () =>
      candidate?.courses.flatMap((course, index) =>
        course.targetSkiId === candidate.resortId
          ? [
              {
                id: candidateCourseId(candidate, course, index),
                name: String(course.properties.name || "名称未設定のコース"),
                coordinates: course.coordinates,
              },
            ]
          : [],
      ) ?? [],
    [candidate],
  );
  const contextLines = useMemo(
    () => [
      ...liftLines.map((line, index) => ({
        id: `lift-${index}`,
        name: line.name,
        coordinates: line.coordinates,
      })),
      ...(baselineCourse
        ? [
            {
              id: "saved-position",
              name: "保存済みの位置",
              coordinates: baselineCourse.coordinates,
            },
          ]
        : []),
    ],
    [liftLines, baselineCourse],
  );
  const updateCoordinates = (update: (coordinates: LngLat[]) => LngLat[]) => {
    if (!candidate || !selected || pending) return;
    onPayloadChange(
      updateCandidateCourse(candidate, selected.id, course => ({
        ...course,
        coordinates: update(course.coordinates),
      })),
    );
  };
  const selectCourse = (id: string) => {
    if (!review.items.some(item => item.id === id)) return;
    setSelectedId(id);
  };

  return (
    <RequestWorkspaceLayout
      title={`${resortName}のコース変更`}
      authorName={authorName}
      createdAt={createdAt}
      status={status}
      statusClass={statusClass}
      editing={editing}
      editDisabled={pending || !candidate}
      onEdit={
        onEdit &&
        (() => {
          setEditorTab("details");
          onEdit();
        })
      }
      fullEditorHref={fullEditorHref}
      footer={footer}
      message={message}
      map={
        editing && editorTab === "geometry" && candidate && selectedCourse ? (
          <div className="flex h-full min-h-0 flex-col">
            <div className="shrink-0 border-b border-blue-200 bg-blue-50 px-4 py-2 text-xs font-medium text-blue-900">
              {`${selected?.name}の頂点をドラッグして位置を修正`}
            </div>
            <div className="min-h-0 flex-1">
              <EditorMap
                center={selectedCourse.coordinates[0] ?? [138, 36]}
                zoom={13}
                courses={editableLines}
                backgroundLines={contextLines}
                activeCourseId={selected?.id ?? null}
                mode={pending ? "view" : "edit"}
                googleMapsApiKey={null}
                layerId="gsiPhoto"
                fitBoundsKey={1}
                showTileSwitcher={false}
                showLabels
                onSelectCourse={selectCourse}
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
              />
            </div>
          </div>
        ) : (
          <RequestMap
            fill
            kind="slope"
            plan={plan}
            submittedPayload={payload}
            preferSubmittedPayload={editing}
            contextLines={liftLines}
            selectedId={selected?.id}
            onSelectLine={selectCourse}
          />
        )
      }
    >
      <RequestFeatureReview
        noun="コース"
        review={review}
        selectedId={selected?.id ?? null}
        onSelect={selectCourse}
        editor={
          editing && candidate && selected ? (
            <SlopeRequestEditor
              candidate={candidate}
              item={selected}
              tab={editorTab}
              onTabChange={setEditorTab}
              onChange={onPayloadChange}
              disabled={pending}
              onResetGeometry={() => {
                if (baselineCourse)
                  updateCoordinates(() =>
                    baselineCourse.coordinates.map(
                      point => [...point] as LngLat,
                    ),
                  );
              }}
            />
          ) : undefined
        }
        extraContent={editing ? undefined : extraContent}
      />
    </RequestWorkspaceLayout>
  );
}
