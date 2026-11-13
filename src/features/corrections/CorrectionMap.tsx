"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import type { EditorMapLine } from "@/features/slope/components/EditorMap";
import { RESORT_INITIAL_ZOOM } from "@/features/slope/constants";
import { LoadingSpinner } from "@/shared/components/LoadingSpinner";
import { SegmentedControl } from "@/shared/components/SegmentedControl";
import type { CorrectionKind, CorrectionLine } from "./model";
import type { GeometryEditor } from "./panel/useGeometryEditor";

const EditorMap = dynamic(
  () =>
    import("@/features/slope/components/EditorMap").then(
      module => module.EditorMap,
    ),
  { ssr: false, loading: () => <LoadingSpinner /> },
);

const SWITCH_ITEM_CLASS = "h-8 whitespace-nowrap px-2 text-xs md:text-sm";

const toMapLine = (line: CorrectionLine): EditorMapLine => ({
  id: line.id,
  name:
    line.name ||
    (line.isNew
      ? `新しい${line.kind === "slope" ? "コース" : "リフト"}`
      : "名称未設定"),
  coordinates: line.coordinates,
});

/**
 * 位置を修正するための地図。管理画面と同じ編集用の地図を使い、
 * 操作は背景の切り替え（標準／航空写真、白黒／カラー）だけを残す。
 */
export function CorrectionMap({
  center,
  kind,
  editor,
  scopeIds,
  compact,
  fitKey,
  focusKey,
}: {
  center: [number, number];
  kind: CorrectionKind;
  editor: GeometryEditor;
  /** この線だけを修正する（コース・リフトの詳細から開いたとき）。ほかの線は選べない */
  scopeIds?: string[];
  /** スマホ。線を直している間は、狭い地図をふさがないよう名前を出さない */
  compact: boolean;
  fitKey: number;
  focusKey: number;
}) {
  const [variant, setVariant] = useState<"pale" | "photo">("photo");
  const [monochrome, setMonochrome] = useState(true);
  const { lines } = editor;
  const editable = useMemo(
    () =>
      lines.filter(line => line.kind === kind && !line.deleted).map(toMapLine),
    [kind, lines],
  );
  // コースを直すときはリフトを、リフトを直すときはコースを目印として薄く出す
  const reference = useMemo(
    () =>
      lines.filter(line => line.kind !== kind && !line.deleted).map(toMapLine),
    [kind, lines],
  );

  return (
    <div className="relative h-full w-full bg-gray-200">
      <EditorMap
        center={center}
        zoom={RESORT_INITIAL_ZOOM}
        courses={editable}
        backgroundLines={reference}
        backgroundLineAppearance={kind === "slope" ? "lift" : "muted"}
        activeCourseId={editor.active?.id ?? null}
        mode={editor.mode}
        googleMapsApiKey={null}
        layerId={variant === "photo" ? "gsiPhoto" : "gsiPale"}
        monochrome={monochrome}
        showTileSwitcher={false}
        showLabels={!compact || !editor.active}
        // 直している線の名前はパネルに出ている。点に重なるので地図には出さない
        labelText={line => (line.id === editor.active?.id ? "" : line.name)}
        drawToolbar="always"
        fitBoundsKey={fitKey}
        fitBoundsToBackground={editable.length === 0}
        focusActiveKey={focusKey}
        onSelectCourse={id => {
          if (!scopeIds || scopeIds.includes(id)) editor.select(id);
        }}
        onAppendVertex={editor.appendVertex}
        onMoveVertex={editor.moveVertex}
        onInsertVertex={editor.insertVertex}
        onDeleteVertex={editor.deleteVertex}
        onFinishDraw={editor.finishDraw}
      />
      <div className="pointer-events-none absolute top-2 left-2 z-20 flex flex-wrap gap-1.5">
        <SegmentedControl
          className="pointer-events-auto shadow-sm"
          options={[
            { value: "pale", label: "標準" },
            { value: "photo", label: "航空写真" },
          ]}
          value={variant}
          onChange={setVariant}
          itemClassName={SWITCH_ITEM_CLASS}
          ariaLabel={option => `背景を${option.label}にする`}
        />
        <SegmentedControl
          className="pointer-events-auto shadow-sm"
          options={[
            { value: "mono", label: "白黒" },
            { value: "color", label: "カラー" },
          ]}
          value={monochrome ? "mono" : "color"}
          onChange={value => setMonochrome(value === "mono")}
          itemClassName={SWITCH_ITEM_CLASS}
          ariaLabel={option => `背景を${option.label}にする`}
        />
      </div>
    </div>
  );
}
