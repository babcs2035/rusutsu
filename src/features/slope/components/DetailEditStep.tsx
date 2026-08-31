"use client";

import {
  ArrowLeft,
  GripVertical,
  ListOrdered,
  Tag,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OrderOrganizerDialog } from "@/features/latest-status-mapping/components/OrderOrganizerDialog";
import { cn } from "@/lib/utils";
import { PanelSection } from "@/shared/components/PanelSection";
import { moveItem, useSortableList } from "@/shared/hooks/useSortableList";
import { updateDefaultSearchWord } from "@/shared/utils/searchWord";
import {
  BINARY_OPTIONS,
  LEVEL_OPTIONS,
  PISTE_DESCRIPTIONS,
  PISTE_OPTIONS,
  REQUIRED_COURSE_FIELD_LABELS,
} from "../constants";
import type {
  BinaryMark,
  CourseDetail,
  EditorCourse,
  PisteMark,
  ResortOption,
} from "../types";
import {
  buildCsv,
  buildGpx,
  buildKml,
  buildRusutsuGeojson,
  buildSlopeDetailJson,
  buildStandardGeojson,
  downloadTextFile,
} from "../utils/exportFiles";
import { getEmptyRequiredCourseFields } from "../utils/validation";

type DetailEditStepProps = {
  resort: ResortOption;
  resorts: ResortOption[];
  sourceKind: "curated" | "osm";
  courses: EditorCourse[];
  setCourses: (updater: (courses: EditorCourse[]) => EditorCourse[]) => void;
  savedAt: string | null;
  selectedCourseId: string | null;
  onSelectedCourseIdChange: (courseId: string | null) => void;
  showLabels: boolean;
  onShowLabelsChange: (showLabels: boolean) => void;
  onBackToLines: () => void;
  onProceed: () => void;
  onExported: () => void;
};

/** まとめて入れられる項目。同じ値になりがちな 3 つだけを出す */
const BULK_FIELDS = [
  {
    key: "piste" as const,
    label: "圧雪",
    options: [
      { value: "○", label: "○" },
      { value: "△", label: "△" },
      { value: "×", label: "×" },
      { value: "", label: "未設定" },
    ],
  },
  {
    key: "morning" as const,
    label: "早朝営業",
    options: [
      { value: "○", label: "○" },
      { value: "×", label: "×" },
      { value: "", label: "未設定" },
    ],
  },
  {
    key: "night" as const,
    label: "ナイター",
    options: [
      { value: "○", label: "○" },
      { value: "×", label: "×" },
      { value: "", label: "未設定" },
    ],
  },
];

type BulkFieldKey = (typeof BULK_FIELDS)[number]["key"];

const formatDateTime = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString("ja-JP");
};

export function DetailEditStep({
  resort,
  resorts,
  sourceKind,
  courses,
  setCourses,
  savedAt,
  selectedCourseId,
  onSelectedCourseIdChange,
  showLabels,
  onShowLabelsChange,
  onBackToLines,
  onProceed,
  onExported,
}: DetailEditStepProps) {
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [showProceedWarning, setShowProceedWarning] = useState(false);
  const [isOrganizerOpen, setIsOrganizerOpen] = useState(false);
  const [bulkOnlyEmpty, setBulkOnlyEmpty] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const courseRowRefs = useRef(new Map<string, HTMLElement>());

  const sortable = useSortableList({
    ids: courses.map(course => course.id),
    onReorder: (from, to) =>
      setCourses(previous => moveItem(previous, from, to)),
  });

  useEffect(() => {
    if (!selectedCourseId || sortable.draggingId) return;
    const frame = window.requestAnimationFrame(() => {
      courseRowRefs.current.get(selectedCourseId)?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedCourseId, sortable.draggingId]);

  const selectedCourse =
    courses.find(course => course.id === selectedCourseId) ?? null;
  const selectedResortSearchName =
    resorts.find(option => option.id === selectedCourse?.skiId)?.searchName ??
    resort.searchName;
  const directoryName =
    sourceKind === "osm" ? "slope_before_osm" : "slope_before";

  const incompleteCourses = useMemo(
    () =>
      courses
        .map((course, index) => ({
          course,
          index,
          emptyFields: getEmptyRequiredCourseFields(course),
        }))
        .filter(item => item.emptyFields.length > 0),
    [courses],
  );

  const updateSelectedCourse = (
    updater: (course: EditorCourse) => EditorCourse,
  ) => {
    if (!selectedCourseId) return;
    setCourses(previous =>
      previous.map(course =>
        course.id === selectedCourseId ? updater(course) : course,
      ),
    );
  };

  /**
   * 早朝・ナイター・圧雪を全コースへ入れる。
   *
   * 一括で入れたあとに 1 本だけ直したい、という使い方が普通なので、
   * ここでは値を書き込むだけにして、あとの個別編集を縛らない。
   * 「未入力だけ」を選んでいるときは、すでに入っている値には触らない。
   */
  const applyToAll = (key: BulkFieldKey, value: string) => {
    let changed = 0;
    setCourses(previous =>
      previous.map(course => {
        if (bulkOnlyEmpty && course.detail[key] !== "") return course;
        if (course.detail[key] === value) return course;
        changed += 1;
        return { ...course, detail: { ...course.detail, [key]: value } };
      }),
    );
    const label = BULK_FIELDS.find(field => field.key === key)?.label ?? key;
    setBulkMessage(
      changed === 0
        ? `${label}を変更するコースはありませんでした。`
        : `${label}を ${changed} 本のコースへ「${value === "" ? "未設定" : value}」で入れました。`,
    );
  };

  const updateDetail = (patch: Partial<CourseDetail>) => {
    updateSelectedCourse(course => ({
      ...course,
      detail: { ...course.detail, ...patch },
    }));
  };

  const handleProceed = () => {
    if (incompleteCourses.length === 0) {
      onProceed();
      return;
    }
    setShowProceedWarning(true);
    onSelectedCourseIdChange(incompleteCourses[0].course.id);
  };

  const handleExport = (
    label: string,
    fileName: string,
    build: () => string,
    mimeType: string,
  ) => {
    downloadTextFile(fileName, build(), mimeType);
    onExported();
    setExportMessage(`${label}（${fileName}）をダウンロードしました。`);
  };

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col gap-2 overflow-y-auto border-l border-gray-200 bg-white p-3">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate font-bold font-[var(--font-heading)] text-base">
            {resort.nameJa}
          </h2>
          <p className="truncate text-[11px] text-gray-500">
            {savedAt
              ? `自動保存: ${formatDateTime(savedAt)}`
              : "まだ自動保存されていません"}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          onClick={onBackToLines}
        >
          <ArrowLeft className="size-3.5" />
          線編集へ戻る
        </Button>
      </div>

      <div className="flex shrink-0 flex-wrap gap-1.5">
        <Button
          size="sm"
          variant="outline"
          disabled={courses.length < 2}
          onClick={() => setIsOrganizerOpen(true)}
        >
          <ListOrdered className="size-3.5" />
          並び替え画面
        </Button>
        <Button
          size="sm"
          variant={showLabels ? "default" : "outline"}
          aria-pressed={showLabels}
          onClick={() => onShowLabelsChange(!showLabels)}
        >
          <Tag className="size-3.5" />
          名前を地図に表示
        </Button>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2">
        <p className="text-[11px] font-bold text-gray-600">
          コース一覧（{courses.length} 本）
        </p>
        {courses.length > 1 && (
          <p className="truncate text-[11px] text-gray-500">
            ⣿をドラッグで並び替え
          </p>
        )}
      </div>

      <div
        ref={sortable.containerRef}
        className="relative max-h-[34%] min-h-[110px] shrink-0 overflow-y-auto rounded-md border border-gray-200"
      >
        {courses.map((course, index) => (
          <div
            key={course.id}
            ref={element => {
              sortable.itemRef(course.id)(element);
              if (element) courseRowRefs.current.set(course.id, element);
              else courseRowRefs.current.delete(course.id);
            }}
            className={cn(
              "relative flex items-center gap-1 border-b border-gray-100 px-1.5 py-1.5 last:border-b-0",
              course.id === selectedCourseId && "bg-blue-50",
              sortable.draggingId === course.id && "opacity-40",
              sortable.dropIndex === index &&
                "before:absolute before:top-0 before:right-0 before:left-0 before:h-0.5 before:bg-blue-500",
              sortable.dropIndex === courses.length &&
                index === courses.length - 1 &&
                "after:absolute after:right-0 after:bottom-0 after:left-0 after:h-0.5 after:bg-blue-500",
            )}
          >
            <button
              type="button"
              aria-label={`${course.name || `${index + 1}番目のコース`}を並び替え`}
              className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              {...sortable.handleProps(course.id)}
            >
              <GripVertical className="size-4" />
            </button>
            <span className="w-6 shrink-0 text-right text-[11px] text-gray-400">
              {index + 1}
            </span>
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left text-sm"
              onClick={() => onSelectedCourseIdChange(course.id)}
            >
              {course.name || "（コース名未入力）"}
            </button>
            {course.splitGroupId && (
              <span className="shrink-0 text-[11px] text-purple-900">分割</span>
            )}
            <span className="shrink-0 text-[11px] text-gray-500">
              {course.detail.level || "難易度未設定"}
            </span>
          </div>
        ))}
        {courses.length === 0 && (
          <p className="p-3 text-sm text-gray-500">コースがありません。</p>
        )}
      </div>

      <PanelSection
        title="早朝・ナイター・圧雪をまとめて設定"
        storageKey="rusutsu-slope-bulk-open"
        defaultOpen={false}
        summary={`${courses.length} 本`}
      >
        <p className="mb-1.5 text-[11px] leading-relaxed text-gray-700">
          同じ値になることが多い項目を、全コースへ一度に入れます。入れたあとで 1
          本ずつ直せば、その変更がそのまま残ります。
        </p>
        <div className="flex flex-col gap-1.5">
          {BULK_FIELDS.map(field => (
            <div key={field.key} className="flex items-center gap-1">
              <span className="w-16 shrink-0 text-[11px] font-bold text-gray-600">
                {field.label}
              </span>
              <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                {field.options.map(option => (
                  <Button
                    key={option.value || "empty"}
                    size="xs"
                    variant="outline"
                    className="min-w-9"
                    title={`${field.label}を全コース「${option.label}」にします`}
                    onClick={() => applyToAll(field.key, option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <label className="mt-2 flex cursor-pointer items-center gap-1.5 text-[11px] text-gray-600">
          <Checkbox
            checked={bulkOnlyEmpty}
            onCheckedChange={checked => setBulkOnlyEmpty(checked === true)}
          />
          未入力のコースだけに入れる（入力済みは変えない）
        </label>
        {bulkMessage && (
          <p className="mt-1 text-[11px] text-green-800">{bulkMessage}</p>
        )}
      </PanelSection>

      {selectedCourse ? (
        <div className="shrink-0 rounded-md border border-gray-200 p-3">
          <div className="flex flex-col gap-2">
            <div>
              <Label>コース名</Label>
              <Input
                className="h-7 w-full rounded-md border border-input bg-white px-2.5 text-xs shadow-sm"
                value={selectedCourse.name}
                onChange={event =>
                  updateSelectedCourse(course => {
                    const nextName = event.target.value;
                    return {
                      ...course,
                      name: nextName,
                      detail: {
                        ...course.detail,
                        searchWord: updateDefaultSearchWord(
                          course.detail.searchWord,
                          selectedResortSearchName,
                          course.name,
                          nextName,
                        ),
                      },
                    };
                  })
                }
              />
            </div>

            <div>
              <Label>難易度</Label>
              <Select
                value={selectedCourse.detail.level}
                onValueChange={v =>
                  updateDetail({ level: v === "__empty__" ? "" : (v ?? "") })
                }
              >
                <SelectTrigger className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__empty__">未設定</SelectItem>
                  {LEVEL_OPTIONS.map(option => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <Label>滑走距離（m）</Label>
                <Input
                  className="h-7 w-full rounded-md border border-input bg-white px-2.5 text-xs shadow-sm"
                  type="number"
                  value={selectedCourse.detail.distance}
                  onChange={event =>
                    updateDetail({ distance: event.target.value })
                  }
                />
              </div>
              <div className="flex-1">
                <Label>平均斜度（°）</Label>
                <Input
                  className="h-7 w-full rounded-md border border-input bg-white px-2.5 text-xs shadow-sm"
                  type="number"
                  value={selectedCourse.detail.avg}
                  onChange={event => updateDetail({ avg: event.target.value })}
                />
              </div>
              <div className="flex-1">
                <Label>最大斜度（°）</Label>
                <Input
                  className="h-7 w-full rounded-md border border-input bg-white px-2.5 text-xs shadow-sm"
                  type="number"
                  value={selectedCourse.detail.max}
                  onChange={event => updateDetail({ max: event.target.value })}
                />
              </div>
            </div>

            <div>
              <Label>圧雪</Label>
              <Select
                value={selectedCourse.detail.piste}
                onValueChange={v =>
                  v && updateDetail({ piste: v as PisteMark })
                }
              >
                <SelectTrigger className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PISTE_OPTIONS.map(option => (
                    <SelectItem key={option || "empty"} value={option}>
                      {option === ""
                        ? "未設定"
                        : `${option}（${PISTE_DESCRIPTIONS[option]}）`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <Label>早朝営業</Label>
                <Select
                  value={selectedCourse.detail.morning}
                  onValueChange={v =>
                    v && updateDetail({ morning: v as BinaryMark })
                  }
                >
                  <SelectTrigger className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BINARY_OPTIONS.map(option => (
                      <SelectItem key={option || "empty"} value={option}>
                        {option === ""
                          ? "未設定"
                          : option === "○"
                            ? "○（あり）"
                            : "×（なし）"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Label>ナイター営業</Label>
                <Select
                  value={selectedCourse.detail.night}
                  onValueChange={v =>
                    v && updateDetail({ night: v as BinaryMark })
                  }
                >
                  <SelectTrigger className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BINARY_OPTIONS.map(option => (
                      <SelectItem key={option || "empty"} value={option}>
                        {option === ""
                          ? "未設定"
                          : option === "○"
                            ? "○（あり）"
                            : "×（なし）"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>画像URL</Label>
              <Input
                className="h-7 w-full rounded-md border border-input bg-white px-2.5 text-xs shadow-sm"
                type="url"
                placeholder="https://example.com/course.jpg"
                value={selectedCourse.detail.image}
                onChange={event => updateDetail({ image: event.target.value })}
              />
            </div>

            <div>
              <Label>検索ワード</Label>
              <Input
                className="h-7 w-full rounded-md border border-input bg-white px-2.5 text-xs shadow-sm"
                placeholder="スキー場名 コース名"
                value={selectedCourse.detail.searchWord}
                onChange={event =>
                  updateDetail({ searchWord: event.target.value })
                }
              />
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-500">
          上の一覧からコースを選ぶと詳細を編集できます。
        </p>
      )}

      <div className="border border-gray-200 rounded-md p-3 flex-shrink-0">
        <p className="text-sm font-bold mb-2">エクスポート</p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="xs"
            variant="default"
            onClick={() =>
              handleExport(
                `Rusutsu 用 ${directoryName}`,
                `${resort.id}.geojson`,
                () => buildRusutsuGeojson(resort.id, courses),
                "application/geo+json",
              )
            }
          >
            Rusutsu 用 {directoryName}
          </Button>
          {sourceKind === "curated" && (
            <Button
              size="xs"
              variant="default"
              onClick={() =>
                handleExport(
                  "Rusutsu 用 slope_detail",
                  `${resort.id}.json`,
                  () => buildSlopeDetailJson(resort.id, courses),
                  "application/json",
                )
              }
            >
              Rusutsu 用 slope_detail
            </Button>
          )}
          <Button
            size="xs"
            variant="outline"
            onClick={() =>
              handleExport(
                "標準 GeoJSON",
                `${resort.id}_standard.geojson`,
                () => buildStandardGeojson(courses),
                "application/geo+json",
              )
            }
          >
            標準 GeoJSON
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() =>
              handleExport(
                "CSV",
                `${resort.id}.csv`,
                () => buildCsv(courses),
                "text/csv",
              )
            }
          >
            CSV
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() =>
              handleExport(
                "KML",
                `${resort.id}.kml`,
                () => buildKml(resort.nameJa, courses),
                "application/vnd.google-earth.kml+xml",
              )
            }
          >
            KML
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() =>
              handleExport(
                "GPX",
                `${resort.id}.gpx`,
                () => buildGpx(resort.nameJa, courses),
                "application/gpx+xml",
              )
            }
          >
            GPX
          </Button>
        </div>
        {exportMessage && (
          <p className="mt-2 text-xs text-green-900">{exportMessage}</p>
        )}
        <p className="mt-2 text-xs text-gray-500">
          確認画面から {directoryName}{" "}
          へ直接保存できます。各形式のダウンロードは
          バックアップや外部ツール用です。
        </p>
      </div>

      <Button variant="default" className="shrink-0" onClick={handleProceed}>
        次へ（確認・保存）
      </Button>

      <Dialog
        open={showProceedWarning && incompleteCourses.length > 0}
        onOpenChange={open => !open && setShowProceedWarning(false)}
      >
        <DialogContent className="flex max-h-[80vh] w-[min(560px,94vw)] max-w-[560px] flex-col gap-3 sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <TriangleAlert className="size-4 text-orange-600" />
              未入力の詳細情報があります
            </DialogTitle>
            <DialogDescription className="text-xs">
              下の項目を直すか、未入力のまま確認画面へ進んでください。コース名を押すと、そのコースの入力欄へ移ります。
            </DialogDescription>
          </DialogHeader>

          <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto rounded-md border p-1">
            {incompleteCourses.map(({ course, index, emptyFields }) => (
              <li key={course.id}>
                <button
                  type="button"
                  className="flex w-full min-w-0 items-baseline gap-2 rounded px-1.5 py-1 text-left hover:bg-gray-50"
                  onClick={() => {
                    onSelectedCourseIdChange(course.id);
                    setShowProceedWarning(false);
                  }}
                >
                  <span className="w-6 shrink-0 text-right text-[11px] text-gray-400">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                    {course.name || "（コース名未入力）"}
                  </span>
                  <span className="shrink-0 text-[11px] text-orange-900">
                    {emptyFields
                      .map(key => REQUIRED_COURSE_FIELD_LABELS[key])
                      .join("、")}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setShowProceedWarning(false);
                onSelectedCourseIdChange(
                  incompleteCourses[0]?.course.id ?? null,
                );
              }}
            >
              入力を修正する
            </Button>
            <Button size="sm" onClick={onProceed}>
              未入力のまま進む
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <OrderOrganizerDialog
        open={isOrganizerOpen}
        onOpenChange={setIsOrganizerOpen}
        resortId={resort.id}
        resortName={resort.nameJa}
        kind="courses"
        items={courses.map(course => ({
          id: course.id,
          name: course.name,
          detail: course.detail.level || "難易度未設定",
        }))}
        selectedItemId={selectedCourseId}
        onSelectItem={onSelectedCourseIdChange}
        onReorder={(from, to) =>
          setCourses(previous => moveItem(previous, from, to))
        }
      />
    </div>
  );
}
