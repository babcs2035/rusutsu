"use client";

import { ArrowLeftRight, Merge, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { EditorCourse } from "../types";
import type { MergeAnchor } from "../utils/courseOps";
import type { LineSide } from "../utils/lineGeometry";

export type MergeDraft = {
  first: MergeAnchor | null;
  second: MergeAnchor | null;
  name: string;
  detailFrom: "first" | "second";
};

type MergeCoursesPanelProps = {
  draft: MergeDraft;
  courses: EditorCourse[];
  canMerge: boolean;
  onKeepChange: (slot: "first" | "second", keep: LineSide) => void;
  onClearSlot: (slot: "first" | "second") => void;
  onNameChange: (name: string) => void;
  onDetailFromChange: (detailFrom: "first" | "second") => void;
  onCancel: () => void;
  onConfirm: () => void;
};

const SIDE_LABELS: Record<LineSide, string> = {
  start: "始点側を残す",
  end: "終点側を残す",
};

const courseName = (course: EditorCourse | undefined): string =>
  course ? course.name || "（名前未入力）" : "";

function AnchorRow({
  slot,
  label,
  anchor,
  course,
  onKeepChange,
  onClearSlot,
}: {
  slot: "first" | "second";
  label: string;
  anchor: MergeAnchor | null;
  course: EditorCourse | undefined;
  onKeepChange: (slot: "first" | "second", keep: LineSide) => void;
  onClearSlot: (slot: "first" | "second") => void;
}) {
  return (
    <div
      className={cn(
        "rounded-md border px-2 py-1.5",
        anchor ? "border-green-300 bg-green-50" : "border-dashed bg-white",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-green-700 text-[11px] font-bold text-white">
          {slot === "first" ? 1 : 2}
        </span>
        <p className="min-w-0 flex-1 truncate text-xs font-semibold">
          {anchor ? courseName(course) : label}
        </p>
        {anchor && (
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="選び直す"
            onClick={() => onClearSlot(slot)}
          >
            <X className="size-3" />
          </Button>
        )}
      </div>
      {anchor && (
        <div className="mt-1 flex gap-1">
          {(["start", "end"] as const).map(side => (
            <Button
              key={side}
              size="xs"
              variant={anchor.keep === side ? "default" : "outline"}
              className="flex-1"
              onClick={() => onKeepChange(slot, side)}
            >
              {SIDE_LABELS[side]}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * コースを 1 本につなぐための操作パネル。
 *
 * 端どうしだけでなく途中どうしもつなげるので、「どちらの側を残すか」を
 * 2 本それぞれで選べるようにしてある。選ぶたびに地図の緑の線が
 * つないだ結果に、灰色の破線が捨てられる側に変わる。
 */
export function MergeCoursesPanel({
  draft,
  courses,
  canMerge,
  onKeepChange,
  onClearSlot,
  onNameChange,
  onDetailFromChange,
  onCancel,
  onConfirm,
}: MergeCoursesPanelProps) {
  const firstCourse = courses.find(
    course => course.id === draft.first?.courseId,
  );
  const secondCourse = courses.find(
    course => course.id === draft.second?.courseId,
  );

  return (
    <div className="shrink-0 rounded-md border-2 border-green-500 bg-green-50/60 p-2">
      <div className="mb-1.5 flex items-center gap-1.5">
        <Merge className="size-4 text-green-800" />
        <p className="flex-1 text-xs font-bold text-green-900">コースを結合</p>
        <Button size="xs" variant="ghost" onClick={onCancel}>
          やめる
        </Button>
      </div>

      <p className="mb-1.5 text-[11px] leading-relaxed text-gray-700">
        {draft.first === null
          ? "地図で 1 本目のコースの、つなぎたい位置をクリックしてください。端のあたりを押すと、その端に吸い付きます。"
          : draft.second === null
            ? "つぎに 2 本目のコースの、つなぎたい位置をクリックしてください。コースの途中どうしでもつなげます。"
            : "緑の線がつないだ結果、灰色の破線が切り落とされる側です。残す側は下のボタンで切り替えられます。"}
      </p>

      <div className="flex flex-col gap-1.5">
        <AnchorRow
          slot="first"
          label="1本目のコースを地図でクリック"
          anchor={draft.first}
          course={firstCourse}
          onKeepChange={onKeepChange}
          onClearSlot={onClearSlot}
        />
        <AnchorRow
          slot="second"
          label="2本目のコースを地図でクリック"
          anchor={draft.second}
          course={secondCourse}
          onKeepChange={onKeepChange}
          onClearSlot={onClearSlot}
        />
      </div>

      {draft.first && draft.second && (
        <div className="mt-2 flex flex-col gap-2">
          <div>
            <Label className="text-[11px]">結合後のコース名</Label>
            <Input
              className="h-7 w-full rounded-md border border-input bg-white px-2.5 text-xs shadow-sm"
              value={draft.name}
              placeholder="コース名"
              onChange={event => onNameChange(event.target.value)}
            />
          </div>
          <div>
            <Label className="text-[11px]">
              難易度・斜度などの詳細を引き継ぐ側
            </Label>
            <div className="mt-0.5 flex gap-1">
              {(["first", "second"] as const).map(slot => (
                <Button
                  key={slot}
                  size="xs"
                  variant={draft.detailFrom === slot ? "default" : "outline"}
                  className="min-w-0 flex-1"
                  onClick={() => onDetailFromChange(slot)}
                >
                  <span className="truncate">
                    {slot === "first"
                      ? courseName(firstCourse)
                      : courseName(secondCourse)}
                  </span>
                </Button>
              ))}
            </div>
          </div>
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => {
                onKeepChange(
                  "first",
                  draft.first?.keep === "start" ? "end" : "start",
                );
                onKeepChange(
                  "second",
                  draft.second?.keep === "start" ? "end" : "start",
                );
              }}
            >
              <ArrowLeftRight className="size-3.5" />
              残す側を両方入れ替える
            </Button>
            <Button
              size="sm"
              variant="green"
              className="flex-1"
              disabled={!canMerge}
              onClick={onConfirm}
            >
              <Merge className="size-3.5" />
              この形で結合する
            </Button>
          </div>
          {!canMerge && (
            <p className="text-[11px] text-red-700">
              残す側の組み合わせでは線がつながりません。どちらかの残す側を
              切り替えてください。
            </p>
          )}
        </div>
      )}
    </div>
  );
}
