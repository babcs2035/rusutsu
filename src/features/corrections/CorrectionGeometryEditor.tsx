"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  EditorLinePick,
  EditorMapLine,
  EditorMapMode,
} from "@/features/slope/components/EditorMap";

const EditorMap = dynamic(
  () =>
    import("@/features/slope/components/EditorMap").then(
      module => module.EditorMap,
    ),
  { ssr: false },
);
type Line = EditorMapLine & {
  kind: "slope" | "lift";
  deleted?: boolean;
  isNew?: boolean;
  properties: Record<string, unknown>;
};
const statusValue = (value: unknown, field: string) =>
  value === "○" || value === "×" || (field === "piste" && value === "△")
    ? value
    : null;
export type CorrectionEntry = {
  targetKind:
    | "resort"
    | "slope"
    | "lift"
    | "ticket"
    | "source"
    | "other"
    | "slope-segment";
  targetId?: string;
  targetName?: string;
  field: string;
  before?: unknown;
  proposed: unknown;
  action?: "change" | "add" | "delete";
};

export function CorrectionGeometryEditor({
  features,
  items,
  onItemsChange,
  mode: editorMode = "geometry",
  selectedTargetId,
  targetKind,
  center: initialCenter,
}: {
  features: Array<{
    id: string;
    name: string;
    kind: "slope" | "lift";
    coordinates: number[][];
    properties: Record<string, unknown>;
  }>;
  items: CorrectionEntry[];
  onItemsChange: (items: CorrectionEntry[]) => void;
  mode?: "geometry" | "segments" | "bulk";
  selectedTargetId?: string;
  targetKind?: "slope" | "lift";
  center?: [number, number];
}) {
  const initial = useMemo<Line[]>(
    () =>
      features.map(line => ({
        id: line.id,
        name: line.name,
        kind: line.kind,
        coordinates: line.coordinates.map(
          point => [point[0], point[1]] as [number, number],
        ),
        properties: {
          ...line.properties,
          _previewCoordinates: line.coordinates,
        },
      })),
    [features],
  );
  const [lines, setLines] = useState<Line[]>(initial);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<EditorMapMode>("view");
  const [kind, setKind] = useState<"slope" | "lift">(
    targetKind ?? features[0]?.kind ?? "slope",
  );
  const [name, setName] = useState("");
  const [history, setHistory] = useState<Line[][]>([]);
  const [redo, setRedo] = useState<Line[][]>([]);
  const [bulkIds, setBulkIds] = useState<string[]>([]);
  const [segmentField, setSegmentField] = useState("pisteSegments");
  const [from, setFrom] = useState("0");
  const [to, setTo] = useState("100");
  const [segmentValue, setSegmentValue] = useState<"○" | "△" | "×">("○");
  const [bulkField, setBulkField] = useState(
    (targetKind ?? features[0]?.kind) === "lift" ? "hood" : "piste",
  );
  const [segmentStart, setSegmentStart] = useState<number | null>(null);
  const [segmentEnd, setSegmentEnd] = useState<number | null>(null);
  const [bulkSegmentTarget, setBulkSegmentTarget] = useState<string | null>(
    null,
  );
  const segmentTargetId = selectedTargetId ?? bulkSegmentTarget;
  const segmentOnly = editorMode === "segments" || !!bulkSegmentTarget;
  const bulkOnly = editorMode === "bulk" && !bulkSegmentTarget;
  const effectiveBulkIds =
    segmentOnly && segmentTargetId ? [segmentTargetId] : bulkIds;
  const selected = lines.find(line => line.id === selectedId && !line.deleted);
  useEffect(() => {
    if (segmentTargetId) setSelectedId(segmentTargetId);
  }, [segmentTargetId]);
  useEffect(() => {
    const geometryItems = items.filter(item => item.field === "coordinates");
    if (!geometryItems.length) return;
    setLines(current => {
      const next = initial.map(line => ({ ...line }));
      for (const item of geometryItems) {
        if (!item.targetId) continue;
        const index = next.findIndex(line => line.id === item.targetId);
        if (item.action === "add") {
          if (index < 0 && Array.isArray(item.proposed))
            next.push({
              id: item.targetId,
              name: item.targetName ?? "名称未設定の線",
              kind: item.targetKind === "lift" ? "lift" : "slope",
              coordinates: item.proposed as [number, number][],
              properties: {},
              isNew: true,
            });
        } else if (index >= 0 && item.action === "delete") {
          const line = next[index];
          if (line) next[index] = { ...line, deleted: true };
        } else if (index >= 0 && Array.isArray(item.proposed)) {
          const line = next[index];
          if (line)
            next[index] = {
              ...line,
              coordinates: item.proposed as [number, number][],
            };
        }
      }
      return JSON.stringify(current) === JSON.stringify(next) ? current : next;
    });
  }, [items, initial]);
  const visible = lines.filter(
    line =>
      line.kind === kind &&
      !line.deleted &&
      (!segmentOnly || line.id === segmentTargetId),
  );
  const previewVisible = useMemo(
    () =>
      visible.map(line => {
        const properties = { ...line.properties };
        for (const item of items) {
          if (
            item.targetId === line.id &&
            item.targetKind === line.kind &&
            item.field !== "coordinates"
          )
            properties[item.field] = item.proposed;
        }
        return { ...line, properties };
      }),
    [items, visible],
  );
  const deleted = lines.filter(line => line.kind === kind && line.deleted);
  const background = deleted.map(({ id, name, coordinates }) => ({
    id,
    name,
    coordinates,
  }));
  const center = visible.flatMap(line => line.coordinates).slice(0, 1)[0] ??
    initialCenter ?? [138.5, 36.5];
  const setLineCoordinates = (coordinates: [number, number][]) => {
    if (!selected) return;
    const next = lines.map(line =>
      line.id === selected.id ? { ...line, coordinates } : line,
    );
    commit(next);
  };
  const syncItems = (next: Line[]) => {
    const changes: CorrectionEntry[] = next.flatMap(
      (line): CorrectionEntry[] => {
        const original = initial.find(value => value.id === line.id);
        if (line.deleted && original)
          return [
            {
              targetKind: line.kind,
              targetId: line.id,
              targetName: line.name,
              field: "coordinates",
              before: original.coordinates,
              proposed: original.coordinates,
              action: "delete",
            },
          ];
        if (line.isNew && line.coordinates.length >= 2)
          return [
            {
              targetKind: line.kind,
              targetId: line.id,
              targetName: line.name,
              field: "coordinates",
              proposed: line.coordinates,
              action: "add",
            },
          ];
        if (
          original &&
          JSON.stringify(original.coordinates) !==
            JSON.stringify(line.coordinates)
        )
          return [
            {
              targetKind: line.kind,
              targetId: line.id,
              field: "coordinates",
              before: original.coordinates,
              proposed: line.coordinates,
              action: "change",
            },
          ];
        return [];
      },
    );
    onItemsChange([
      ...items.filter(
        item =>
          item.field !== "coordinates" ||
          !(item.targetKind === "slope" || item.targetKind === "lift"),
      ),
      ...changes,
    ]);
  };
  const commit = (next: Line[]) => {
    setHistory(prev => [...prev.slice(-39), lines]);
    setRedo([]);
    setLines(next);
    syncItems(next);
  };
  const undoLast = () => {
    const previous = history.at(-1);
    if (!previous) return;
    setRedo(prev => [...prev, lines]);
    setHistory(history.slice(0, -1));
    setLines(previous);
    syncItems(previous);
  };
  const redoLast = () => {
    const next = redo.at(-1);
    if (!next) return;
    setHistory(prev => [...prev, lines]);
    setRedo(redo.slice(0, -1));
    setLines(next);
    syncItems(next);
  };
  const addSegmentRange = (override?: {
    from: number;
    to: number;
    value: "○" | "△" | "×";
  }) => {
    const start = override
      ? override.from
      : segmentOnly
        ? Math.min(segmentStart ?? 0, segmentEnd ?? 0)
        : Number(from) / 100;
    const end = override
      ? override.to
      : segmentOnly
        ? Math.max(segmentStart ?? 0, segmentEnd ?? 0)
        : Number(to) / 100;
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end > 1 ||
      start >= end ||
      !effectiveBulkIds.length
    )
      return;
    const range = {
      from: start,
      to: end,
      value: override?.value ?? segmentValue,
    };
    const entries = effectiveBulkIds.flatMap(id => {
      const line = lines.find(
        value => value.id === id && value.kind === "slope",
      );
      if (!line) return [];
      const previous =
        items.find(item => item.targetId === id && item.field === segmentField)
          ?.proposed ?? line.properties[segmentField];
      const current = Array.isArray(previous)
        ? (previous as Array<typeof range>).flatMap(segment =>
            segment.to <= start || segment.from >= end
              ? [segment]
              : [
                  ...(segment.from < start ? [{ ...segment, to: start }] : []),
                  ...(segment.to > end ? [{ ...segment, from: end }] : []),
                ],
          )
        : [];
      return [
        {
          targetKind: "slope" as const,
          targetId: id,
          targetName: line.name,
          field: segmentField,
          before: line.properties[segmentField],
          proposed: [...current, range].sort((a, b) => a.from - b.from),
          action: "change" as const,
        },
      ];
    });
    const fullRows = bulkSegmentTarget
      ? lines
          .filter(line => line.kind === kind && !line.deleted)
          .map(line => {
            const proposal = items.find(
              item => item.targetId === line.id && item.field === bulkField,
            );
            return {
              targetKind: line.kind,
              targetId: line.id,
              targetName: line.name,
              field: bulkField,
              before: line.properties[bulkField],
              proposed: proposal
                ? proposal.proposed
                : statusValue(line.properties[bulkField], bulkField),
            };
          })
      : [];
    onItemsChange([
      ...items.filter(
        item =>
          !(bulkSegmentTarget && item.field === bulkField) &&
          !(
            item.targetId &&
            effectiveBulkIds.includes(item.targetId) &&
            item.field === segmentField
          ),
      ),
      ...fullRows,
      ...entries,
    ]);
  };
  const bulkFields =
    kind === "lift"
      ? ["hood", "footrest", "oilShield", "morning", "night"]
      : ["piste", "morning", "night"];
  const allSelectedUnknown =
    visible.length > 0 &&
    visible.every(line => {
      const current = line.properties[bulkField];
      return (
        statusValue(current, bulkField) === null &&
        !(
          Array.isArray(line.properties[`${bulkField}Segments`]) &&
          (line.properties[`${bulkField}Segments`] as unknown[]).length
        )
      );
    });
  const setBulkStatus = (id: string, value: "○" | "△" | "×" | null) => {
    const byId = new Map(
      items
        .filter(item => item.field === bulkField && item.targetId)
        .map(item => [item.targetId as string, item.proposed]),
    );
    byId.set(id, value);
    setBulkProposals(byId, [id]);
  };
  const setAllBulkStatus = (value: "○" | "△" | "×") => {
    setBulkProposals(
      new Map(visible.map(line => [line.id, value])),
      visible.map(line => line.id),
    );
  };
  const setBulkProposals = (
    proposals: Map<string, unknown>,
    resetIds: string[],
  ) => {
    const rows = visible.map(line => ({
      targetKind: line.kind,
      targetId: line.id,
      targetName: line.name,
      field: bulkField,
      before: line.properties[bulkField],
      proposed: proposals.has(line.id)
        ? proposals.get(line.id)
        : statusValue(line.properties[bulkField], bulkField),
    }));
    const rangesField = `${bulkField}Segments`;
    const resetRanges =
      kind === "slope"
        ? visible.flatMap(line => {
            const previous =
              items.find(
                item => item.targetId === line.id && item.field === rangesField,
              )?.proposed ?? line.properties[rangesField];
            return resetIds.includes(line.id) &&
              Array.isArray(previous) &&
              previous.length
              ? [
                  {
                    targetKind: line.kind,
                    targetId: line.id,
                    field: rangesField,
                    before: line.properties[rangesField],
                    proposed: [],
                  },
                ]
              : [];
          })
        : [];
    const dirty =
      rows.some(
        row =>
          JSON.stringify(statusValue(row.before, bulkField)) !==
          JSON.stringify(row.proposed ?? null),
      ) || resetRanges.length > 0;
    onItemsChange([
      ...items.filter(
        item =>
          item.field !== bulkField &&
          !resetRanges.some(
            range =>
              range.targetId === item.targetId && range.field === item.field,
          ),
      ),
      ...(dirty ? rows : []),
      ...resetRanges,
    ]);
  };
  const beginDraw = () => {
    const id = `new-${crypto.randomUUID()}`;
    commit([
      ...lines,
      {
        id,
        name: "新しい線",
        kind,
        coordinates: [],
        properties: {},
        isNew: true,
      },
    ]);
    setSelectedId(id);
    setMode("draw");
  };
  const finishDraw = () => {
    const line = lines.find(value => value.id === selectedId);
    if (!line || line.coordinates.length < 2) return;
    const named = {
      ...line,
      name:
        name.trim() ||
        (kind === "slope" ? "名称未設定のコース" : "名称未設定のリフト"),
    };
    commit(lines.map(value => (value.id === named.id ? named : value)));
    setName("");
    setMode("view");
  };
  const fractionAt = (pick: EditorLinePick) => {
    const line = lines.find(value => value.id === pick.lineId);
    if (!line) return 0;
    const lengths = line.coordinates.slice(0, -1).map((point, index) => {
      const next = line.coordinates[index + 1];
      if (!next) return 0;
      const lat1 = (point[1] * Math.PI) / 180;
      const lat2 = (next[1] * Math.PI) / 180;
      const dLat = lat2 - lat1;
      const dLon = ((next[0] - point[0]) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
      return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    });
    const total = lengths.reduce((sum, value) => sum + value, 0);
    if (!total) return 0;
    const before = lengths
      .slice(0, pick.segmentIndex)
      .reduce((sum, value) => sum + value, 0);
    const segmentLength = lengths[pick.segmentIndex] ?? 0;
    return Math.max(0, Math.min(1, (before + segmentLength * pick.t) / total));
  };
  return (
    <section className="mb-4 overflow-hidden rounded-lg border">
      <div className="flex flex-wrap items-center gap-2 border-b p-2">
        <strong className="mr-auto text-sm">
          {segmentOnly
            ? "コースの区間状態"
            : bulkOnly
              ? "状態の一括修正"
              : "位置の修正"}
        </strong>
        {bulkSegmentTarget && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setBulkSegmentTarget(null)}
          >
            一覧へ戻る
          </Button>
        )}
        {!bulkOnly && !targetKind && (
          <Select
            value={kind}
            items={{ slope: "コース", lift: "リフト" }}
            onValueChange={value => {
              if (value === null) return;
              setKind(value as "slope" | "lift");
              setSelectedId(null);
              setMode("view");
            }}
          >
            <SelectTrigger aria-label="対象の線" className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="slope">コース</SelectItem>
              <SelectItem value="lift">リフト</SelectItem>
            </SelectContent>
          </Select>
        )}
        {!segmentOnly && !bulkOnly && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={history.length === 0}
            onClick={undoLast}
          >
            元に戻す
          </Button>
        )}
        {!segmentOnly && !bulkOnly && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={redo.length === 0}
            onClick={redoLast}
          >
            やり直す
          </Button>
        )}
        {!segmentOnly && !bulkOnly && (
          <Button type="button" size="sm" variant="outline" onClick={beginDraw}>
            線を追加
          </Button>
        )}
      </div>
      <div className="grid md:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="relative h-[48vh] min-h-72">
          <EditorMap
            center={center as [number, number]}
            zoom={11}
            courses={previewVisible}
            backgroundLines={background}
            activeCourseId={selectedId}
            mode={bulkOnly || segmentOnly ? "view" : mode}
            correctionPreview
            correctionSelection={
              segmentOnly &&
              segmentTargetId &&
              segmentStart !== null &&
              segmentEnd !== null
                ? {
                    lineId: segmentTargetId,
                    from: segmentStart,
                    to: segmentEnd,
                  }
                : undefined
            }
            readOnlyPick={segmentOnly}
            googleMapsApiKey={null}
            layerId="gsiPhoto"
            onSelectCourse={id => {
              setSelectedId(id);
              setMode(segmentOnly ? "view" : "edit");
            }}
            onPickLinePoint={pick => {
              if (!segmentOnly) return;
              const fraction = fractionAt(pick);
              if (segmentStart === null || segmentEnd !== null) {
                setSegmentStart(fraction);
                setSegmentEnd(null);
              } else setSegmentEnd(fraction);
            }}
            onAppendVertex={point => {
              const line = lines.find(value => value.id === selectedId);
              if (line) setLineCoordinates([...line.coordinates, point]);
            }}
            onMoveVertex={(index, point) => {
              const line = lines.find(value => value.id === selectedId);
              if (line)
                setLineCoordinates(
                  line.coordinates.map((coord, position) =>
                    position === index ? point : coord,
                  ),
                );
            }}
            onInsertVertex={(index, point) => {
              const line = lines.find(value => value.id === selectedId);
              if (line)
                setLineCoordinates([
                  ...line.coordinates.slice(0, index),
                  point,
                  ...line.coordinates.slice(index),
                ]);
            }}
            onFinishDraw={finishDraw}
            onDeleteVertex={index => {
              const line = lines.find(value => value.id === selectedId);
              if (line && line.coordinates.length > 2)
                setLineCoordinates(
                  line.coordinates.filter((_, position) => position !== index),
                );
            }}
          />
        </div>
        <aside className="max-h-72 space-y-2 overflow-y-auto border-t p-3 text-sm md:max-h-[48vh] md:border-t-0 md:border-l">
          <p className="text-xs text-slate-600">
            線や点を選んで位置を編集できます。線は自動接続されません。
          </p>
          {!segmentOnly && !bulkOnly && mode === "draw" && (
            <>
              <label className="block text-xs">
                新しい線の名前
                <input
                  value={name}
                  onChange={event => setName(event.target.value)}
                  className="mt-1 h-8 w-full rounded border px-2 text-sm"
                  placeholder="任意"
                />
              </label>
              <Button
                type="button"
                size="sm"
                className="w-full"
                onClick={finishDraw}
              >
                線を確定
              </Button>
            </>
          )}
          {!segmentOnly && !bulkOnly && selected && !selected.isNew && (
            <div className="space-y-2">
              <p className="font-medium">{selected.name}</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => {
                  commit(
                    lines.map(line =>
                      line.id === selected.id
                        ? { ...line, deleted: true }
                        : line,
                    ),
                  );
                  setSelectedId(null);
                  setMode("view");
                }}
              >
                削除を提案
              </Button>
            </div>
          )}
          {!segmentOnly &&
            !bulkOnly &&
            deleted.map(line => (
              <div
                key={line.id}
                className="flex items-center justify-between text-xs text-slate-500"
              >
                <span>{line.name}（削除予定）</span>
                <button
                  type="button"
                  className="underline"
                  onClick={() =>
                    commit(
                      lines.map(value =>
                        value.id === line.id
                          ? { ...value, deleted: false }
                          : value,
                      ),
                    )
                  }
                >
                  取り消す
                </button>
              </div>
            ))}
          {bulkOnly && (
            <div className="border-t pt-2">
              <p className="font-medium text-xs">項目ごとに状態を提案</p>
              <Select
                value={bulkField}
                items={bulkFields.map(field => ({
                  value: field,
                  label: (
                    {
                      piste: "圧雪",
                      morning: "早朝営業",
                      night: "ナイター",
                      hood: "フード",
                      footrest: "フットレスト",
                      oilShield: "オイルシールド",
                    } as Record<string, string>
                  )[field],
                }))}
                onValueChange={value => {
                  if (value !== null) setBulkField(value);
                }}
              >
                <SelectTrigger
                  aria-label="一括修正する項目"
                  className="mt-1 h-8 w-full text-xs"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {bulkFields.map(field => (
                    <SelectItem key={field} value={field}>
                      {
                        (
                          {
                            piste: "圧雪",
                            morning: "早朝営業",
                            night: "ナイター",
                            hood: "フード",
                            footrest: "フットレスト",
                            oilShield: "オイルシールド",
                          } as Record<string, string>
                        )[field]
                      }
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="mt-1 max-h-40 space-y-1 overflow-auto">
                {visible.map(line => {
                  const proposal = items.find(
                    item =>
                      item.targetId === line.id && item.field === bulkField,
                  );
                  const proposed = proposal
                    ? proposal.proposed
                    : statusValue(line.properties[bulkField], bulkField);
                  const rangesField = `${bulkField}Segments`;
                  const rangeProposal = items.find(
                    item =>
                      item.targetId === line.id && item.field === rangesField,
                  );
                  const ranges = rangeProposal
                    ? rangeProposal.proposed
                    : line.properties[rangesField];
                  const hasRanges = Array.isArray(ranges) && ranges.length > 0;
                  return (
                    <div
                      key={line.id}
                      className="flex flex-wrap items-center gap-1 text-xs"
                    >
                      <span className="mr-auto w-full font-medium sm:w-auto">
                        {line.name}
                      </span>
                      <span>
                        {line.properties[bulkField] == null ||
                        line.properties[bulkField] === ""
                          ? "未登録"
                          : String(line.properties[bulkField])}{" "}
                        →{" "}
                        {hasRanges
                          ? "区間別"
                          : proposed == null
                            ? "不明"
                            : String(proposed)}
                      </span>
                      {(bulkField === "piste"
                        ? (["○", "△", "×", null] as const)
                        : (["○", "×", null] as const)
                      ).map(value => (
                        <Button
                          key={value ?? "unknown"}
                          type="button"
                          size="sm"
                          aria-pressed={!hasRanges && proposed === value}
                          variant={
                            !hasRanges && proposed === value
                              ? "default"
                              : "outline"
                          }
                          onClick={() => setBulkStatus(line.id, value)}
                        >
                          {value ?? "不明"}
                        </Button>
                      ))}
                      {kind === "slope" && (
                        <Button
                          type="button"
                          size="sm"
                          variant={hasRanges ? "default" : "outline"}
                          onClick={() => {
                            setBulkSegmentTarget(line.id);
                            setSegmentField(rangesField);
                            setSegmentStart(null);
                            setSegmentEnd(null);
                            setSegmentValue("○");
                          }}
                        >
                          区間別
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
              {allSelectedUnknown ? (
                <div className="mt-2 flex gap-2">
                  {(["○", "×"] as const).map(value => (
                    <Button
                      key={value}
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setAllBulkStatus(value)}
                    >
                      すべて{value}
                    </Button>
                  ))}
                </div>
              ) : null}
              <p className="mt-2 text-[11px] text-slate-500">
                一つ変更すると全コース／リフトの行を申請します。変更しない行は現在値のまま審査されます。
              </p>
            </div>
          )}
          {segmentOnly && (
            <div className="border-t pt-2">
              <p className="font-medium text-xs">区間の状態をまとめて修正</p>
              {!segmentOnly && (
                <div className="mt-1 max-h-20 space-y-1 overflow-auto">
                  {visible.map(line => (
                    <label
                      key={line.id}
                      className="flex items-center gap-1 text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={bulkIds.includes(line.id)}
                        onChange={event =>
                          setBulkIds(ids =>
                            event.target.checked
                              ? [...ids, line.id]
                              : ids.filter(id => id !== line.id),
                          )
                        }
                      />
                      {line.name}
                    </label>
                  ))}
                </div>
              )}
              <Select
                value={segmentField}
                items={[
                  { value: "pisteSegments", label: "圧雪区間" },
                  { value: "morningSegments", label: "早朝営業区間" },
                  { value: "nightSegments", label: "ナイター営業区間" },
                ]}
                onValueChange={value => {
                  if (value === null) return;
                  setSegmentField(value);
                  setSegmentValue("○");
                  setSegmentStart(null);
                  setSegmentEnd(null);
                }}
              >
                <SelectTrigger
                  aria-label="区間の種類"
                  className="mt-1 h-8 w-full text-xs"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pisteSegments">圧雪区間</SelectItem>
                  <SelectItem value="morningSegments">早朝営業区間</SelectItem>
                  <SelectItem value="nightSegments">
                    ナイター営業区間
                  </SelectItem>
                </SelectContent>
              </Select>
              {segmentOnly ? (
                <p className="text-xs text-slate-600">
                  地図上で区間の始点と終点を順にタップしてください。線には接続しません。
                  <br />
                  指定範囲:{" "}
                  {segmentStart === null
                    ? "始点未選択"
                    : `${Math.round(segmentStart * 100)}%`}{" "}
                  →{" "}
                  {segmentEnd === null
                    ? "終点未選択"
                    : `${Math.round(segmentEnd * 100)}%`}
                </p>
              ) : (
                <div className="mt-1 grid grid-cols-2 gap-1">
                  <label className="text-[11px]">
                    開始 %
                    <input
                      type="number"
                      min="0"
                      max="99"
                      value={from}
                      onChange={event => setFrom(event.target.value)}
                      className="h-8 w-full rounded border px-1"
                    />
                  </label>
                  <label className="text-[11px]">
                    終了 %
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={to}
                      onChange={event => setTo(event.target.value)}
                      className="h-8 w-full rounded border px-1"
                    />
                  </label>
                </div>
              )}
              <div className="mt-1 flex gap-1">
                {(segmentField === "pisteSegments"
                  ? (["○", "△", "×"] as const)
                  : (["○", "×"] as const)
                ).map(value => (
                  <Button
                    key={value}
                    type="button"
                    variant={segmentValue === value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSegmentValue(value)}
                  >
                    {value}
                  </Button>
                ))}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-1 w-full"
                disabled={
                  !effectiveBulkIds.length ||
                  (segmentOnly &&
                    (segmentStart === null ||
                      segmentEnd === null ||
                      segmentStart === segmentEnd))
                }
                onClick={() => addSegmentRange()}
              >
                選択線へ追加
              </Button>
              {(() => {
                const line = lines.find(line => line.id === segmentTargetId);
                const proposal = items.find(
                  item =>
                    item.targetId === segmentTargetId &&
                    item.field === segmentField,
                );
                const ranges = proposal
                  ? proposal.proposed
                  : line?.properties[segmentField];
                if (!Array.isArray(ranges)) return null;
                return (
                  <div
                    role="group"
                    className="mt-2 space-y-1"
                    aria-label="設定済みの区間"
                  >
                    {(
                      ranges as Array<{
                        from: number;
                        to: number;
                        value: "○" | "△" | "×";
                      }>
                    ).map((range, index) => (
                      <div
                        key={`${range.from}-${range.to}`}
                        className="flex flex-wrap items-center gap-1 rounded border p-1 text-xs"
                      >
                        <button
                          type="button"
                          className="mr-auto underline"
                          onClick={() => {
                            setSegmentStart(range.from);
                            setSegmentEnd(range.to);
                            setSegmentValue(range.value);
                          }}
                        >
                          区間{index + 1}（{Math.round(range.from * 100)}〜
                          {Math.round(range.to * 100)}%）
                        </button>
                        {(segmentField === "pisteSegments"
                          ? (["○", "△", "×"] as const)
                          : (["○", "×"] as const)
                        ).map(value => (
                          <Button
                            key={value}
                            type="button"
                            size="sm"
                            aria-pressed={range.value === value}
                            variant={
                              range.value === value ? "default" : "outline"
                            }
                            onClick={() => addSegmentRange({ ...range, value })}
                          >
                            {value}
                          </Button>
                        ))}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}
          <p className="text-xs text-slate-500">{visible.length}本を表示中</p>
        </aside>
      </div>
    </section>
  );
}
