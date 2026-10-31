"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { adminToaster } from "@/app/admin/AdminToaster";
import { Button } from "@/components/ui/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { EditorMap, type EditorMapLine } from "../slope/components/EditorMap";
import { saveMapSplit } from "./actions";
import {
  SPLIT_LAYER_LABELS,
  type SplitArea,
  type SplitLayerKind,
  type SplitReason,
} from "./types";

/** EditorMap の通常の線（青）と強調した線（オレンジ）で、2つのスキー場を塗り分ける */
const MEMBER_COLORS = ["bg-[#3182CE]", "bg-[#F59E0B]"];
const REASON_LABELS: Record<SplitReason, string> = {
  saved: "保存済み",
  overlap: "既存地図と一致",
  nearest: "拠点が近い",
};

type Assignments = Record<string, Partial<Record<SplitLayerKind, string[]>>>;

const initialAssignments = (areas: SplitArea[]): Assignments =>
  Object.fromEntries(
    areas.map(area => [
      area.id,
      Object.fromEntries(
        area.layers.map(layer => [
          layer.kind,
          layer.lines.map(line => line.memberId),
        ]),
      ),
    ]),
  );

const lineId = (kind: SplitLayerKind, index: number) => `${kind}:${index}`;

type Props = {
  areas: SplitArea[];
  googleMapsApiKey: string | null;
};

export function MapSplitWorkspace({ areas, googleMapsApiKey }: Props) {
  const [areaId, setAreaId] = useState(areas[0]?.id ?? "");
  const [layerKind, setLayerKind] = useState<SplitLayerKind>(
    areas[0]?.layers[0]?.kind ?? "slope_before",
  );
  const [assignments, setAssignments] = useState(() =>
    initialAssignments(areas),
  );
  const [saved, setSaved] = useState(() => initialAssignments(areas));
  const [savedAt, setSavedAt] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(areas.map(area => [area.id, area.savedAt])),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [fitBoundsKey, setFitBoundsKey] = useState(1);
  const [isSaving, startSaving] = useTransition();

  const area = areas.find(item => item.id === areaId) ?? areas[0];
  const layer =
    area?.layers.find(item => item.kind === layerKind) ?? area?.layers[0];
  const areaAssignments = area ? (assignments[area.id] ?? {}) : {};
  const layerAssignments = layer ? (areaAssignments[layer.kind] ?? []) : [];
  const isDirty =
    !!area &&
    JSON.stringify(assignments[area.id]) !== JSON.stringify(saved[area.id]);

  const memberIndex = useMemo(
    () => new Map(area?.members.map((member, i) => [member.id, i]) ?? []),
    [area],
  );

  const { lines, highlightedLineIds, backgroundLines } = useMemo(() => {
    if (!area || !layer)
      return {
        lines: [],
        highlightedLineIds: new Set<string>(),
        backgroundLines: [],
      };
    const drawable = layer.lines.filter(line => line.coordinates.length >= 2);
    return {
      lines: drawable.map(
        (line): EditorMapLine => ({
          id: lineId(layer.kind, line.index),
          name: line.name,
          coordinates: line.coordinates,
          kind: layer.kind === "lift_before" ? "lift" : "slope",
        }),
      ),
      highlightedLineIds: new Set(
        drawable
          .filter(
            line =>
              (memberIndex.get(layerAssignments[line.index] ?? "") ?? 0) % 2 ===
              1,
          )
          .map(line => lineId(layer.kind, line.index)),
      ),
      // 他の種類の線は、位置関係が分かるように薄く出す
      backgroundLines: area.layers
        .filter(item => item.kind !== layer.kind)
        .flatMap(item =>
          item.lines
            .filter(line => line.coordinates.length >= 2)
            .map(line => ({
              id: lineId(item.kind, line.index),
              name: `${SPLIT_LAYER_LABELS[item.kind]}: ${line.name}`,
              coordinates: line.coordinates,
            })),
        ),
    };
  }, [area, layer, layerAssignments, memberIndex]);

  if (!area || !layer) {
    return (
      <p className="p-6 text-sm text-gray-600">
        振り分けが必要な地図はありません。
      </p>
    );
  }

  const setMember = (index: number, memberId: string) =>
    setAssignments(current => {
      const next = [...(current[area.id]?.[layer.kind] ?? [])];
      next[index] = memberId;
      return {
        ...current,
        [area.id]: { ...current[area.id], [layer.kind]: next },
      };
    });

  // 地図で線を押すたびに、次のスキー場へ切り替える
  const cycleMember = (id: string) => {
    const index = Number(id.split(":")[1]);
    const current = memberIndex.get(layerAssignments[index] ?? "") ?? 0;
    const next = area.members[(current + 1) % area.members.length];
    if (next) setMember(index, next.id);
    setActiveId(null);
  };

  const changeArea = (id: string) => {
    if (
      isDirty &&
      !window.confirm("保存していない振り分けがあります。切り替えますか？")
    )
      return;
    const nextArea = areas.find(item => item.id === id);
    setAreaId(id);
    setLayerKind(nextArea?.layers[0]?.kind ?? "slope_before");
    setActiveId(null);
    setFitBoundsKey(key => key + 1);
  };

  const save = () =>
    startSaving(async () => {
      const result = await saveMapSplit({
        areaId: area.id,
        layers: area.layers.map(item => ({
          kind: item.kind,
          sourceHash: item.sourceHash,
          memberIds: areaAssignments[item.kind] ?? [],
        })),
      });
      if (!result.ok) {
        adminToaster.create({ title: result.message, type: "error" });
        return;
      }
      setSaved(current => ({ ...current, [area.id]: areaAssignments }));
      setSavedAt(current => ({ ...current, [area.id]: result.savedAt }));
      adminToaster.create({ title: "保存しました", type: "success" });
    });

  const counts = area.members.map(
    member =>
      layerAssignments.filter(memberId => memberId === member.id).length,
  );

  return (
    <div className="admin-map-workspace flex h-[100dvh] min-h-0 flex-col overflow-hidden">
      <header className="admin-editor-header flex min-w-0 shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-gray-200 bg-white px-3 py-1.5">
        <h2 className="hidden shrink-0 whitespace-nowrap font-bold font-[var(--font-heading)] text-sm md:block">
          地図の分割（一時）
        </h2>
        <NativeSelect
          size="sm"
          className="min-w-0 flex-1 md:max-w-[280px]"
          value={area.id}
          aria-label="エリア"
          onChange={event => changeArea(event.target.value)}
        >
          {areas.map(item => (
            <NativeSelectOption key={item.id} value={item.id}>
              {item.name}
              {savedAt[item.id] ? "（保存済み）" : ""}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {/* スマホでは線の種類を2段目に置き、エリア名を広く見せる */}
        <div className="order-last flex basis-full gap-1 md:order-none md:basis-auto">
          {area.layers.map(item => (
            <Button
              key={item.kind}
              size="sm"
              variant={item.kind === layer.kind ? "default" : "outline"}
              onClick={() => {
                setLayerKind(item.kind);
                setActiveId(null);
              }}
            >
              {SPLIT_LAYER_LABELS[item.kind]}
              <span className="text-xs opacity-70">{item.lines.length}</span>
            </Button>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-2 md:ml-auto">
          {isDirty && <span className="text-xs text-orange-600">未保存</span>}
          <Button
            size="sm"
            disabled={isSaving || (!isDirty && savedAt[area.id] !== null)}
            onClick={save}
          >
            {isSaving ? "保存中…" : "保存"}
          </Button>
          <Link
            href="/admin"
            className="shrink-0 rounded-lg px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          >
            管理画面
          </Link>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="relative min-h-[45%] flex-1 md:min-h-0">
          <EditorMap
            center={
              area.layers[0]?.lines.find(line => line.coordinates.length > 0)
                ?.coordinates[0] ?? [138, 36]
            }
            zoom={13}
            courses={lines}
            highlightedLineIds={highlightedLineIds}
            backgroundLines={backgroundLines}
            activeCourseId={activeId}
            mode="view"
            googleMapsApiKey={googleMapsApiKey}
            fitBoundsKey={fitBoundsKey}
            showLabels
            onSelectCourse={cycleMember}
          />
        </div>
        <aside className="flex min-h-0 flex-1 flex-col border-gray-200 border-t bg-white md:w-[360px] md:flex-none md:border-t-0 md:border-l">
          <div className="shrink-0 space-y-1.5 border-gray-200 border-b px-3 py-2">
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {area.members.map((member, i) => (
                <span
                  key={member.id}
                  className="flex items-center gap-1.5 text-sm"
                >
                  <span
                    className={cn(
                      "size-3 shrink-0 rounded-full",
                      MEMBER_COLORS[i % 2],
                    )}
                  />
                  {member.name}
                  <span className="text-gray-500 text-xs">{counts[i]}</span>
                </span>
              ))}
            </div>
            <p className="text-gray-500 text-xs">
              地図の線を押すと振り分け先が切り替わります。一覧の名前を押すと地図で赤く示します。
              {area.staleLayerKinds.length > 0 &&
                "保存後に元の地図が更新されたため、一部は自動の振り分けに戻っています。"}
            </p>
          </div>
          <ul className="min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto">
            {layer.lines.map(line => {
              const id = lineId(layer.kind, line.index);
              const memberId = layerAssignments[line.index] ?? line.memberId;
              const changed = memberId !== line.memberId;
              return (
                <li
                  key={id}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1",
                    activeId === id && "bg-red-50",
                  )}
                >
                  <span
                    className={cn(
                      "size-2.5 shrink-0 rounded-full",
                      MEMBER_COLORS[(memberIndex.get(memberId) ?? 0) % 2],
                    )}
                  />
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    disabled={line.coordinates.length < 2}
                    onClick={() =>
                      setActiveId(current => (current === id ? null : id))
                    }
                  >
                    <span className="block truncate text-sm">{line.name}</span>
                    <span className="block text-gray-500 text-xs">
                      {changed ? "手動で変更" : REASON_LABELS[line.reason]}
                    </span>
                  </button>
                  <NativeSelect
                    size="sm"
                    className="w-[132px] shrink-0"
                    value={memberId}
                    aria-label={`${line.name}の振り分け先`}
                    onChange={event =>
                      setMember(line.index, event.target.value)
                    }
                  >
                    {area.members.map(member => (
                      <NativeSelectOption key={member.id} value={member.id}>
                        {member.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>
    </div>
  );
}
