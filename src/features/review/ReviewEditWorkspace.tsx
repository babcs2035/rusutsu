"use client";

import {
  AlertTriangle,
  BookOpenText,
  Check,
  FileSearch,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  REVIEW_CATEGORY_IDS,
  REVIEW_CATEGORY_LABELS,
  type ReviewArticleFile,
  type ReviewCategoryId,
  type ReviewDetailCourse,
  type ReviewDetailEvaluation,
  type ReviewDetailFile,
  type ReviewSource,
} from "@/features/reviews/types";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import { loadReviewForEdit, saveReviewFiles } from "./actions";
import type { ReviewEditData, ReviewResortOption } from "./types";

type EditorMode = "warnings" | "detail" | "article";
type WarningKind = "good" | "bad" | "courses";

type ReviewWarning = {
  categoryId: ReviewCategoryId;
  kind: WarningKind;
  index: number;
  label: string;
  reason: string;
};

const WARNING_KIND_LABELS: Record<WarningKind, string> = {
  good: "良い評価",
  bad: "悪い評価",
  courses: "コース",
};

const warningAnchorId = (
  categoryId: ReviewCategoryId,
  kind: WarningKind,
  index: number,
) => `review-warning-${categoryId}-${kind}-${index}`;

const cloneSource = (): ReviewSource => ({ name: "", url: "", quote: "" });

const newEvaluation = (): ReviewDetailEvaluation => ({
  title: "",
  description: "",
  sources: [],
  warn: false,
  warnReason: null,
});

const newCourse = (): ReviewDetailCourse => ({
  name: "",
  description: "",
  sources: [],
  warn: false,
  warnReason: null,
});

const SourcesEditor = ({
  sources,
  onChange,
}: {
  sources: ReviewSource[];
  onChange: (sources: ReviewSource[]) => void;
}) => (
  <div className="mt-4">
    <div className="flex items-center justify-between">
      <p className="text-gray-700 text-xs font-medium">出典</p>
      <Button
        type="button"
        size="xs"
        variant="outline"
        onClick={() => onChange([...sources, cloneSource()])}
      >
        <Plus size={14} />
        出典を追加
      </Button>
    </div>
    {sources.length === 0 ? (
      <p className="mt-2 text-gray-400 text-xs">出典は登録されていません。</p>
    ) : (
      <div className="mt-2 flex flex-col gap-3">
        {sources.map((source, index) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: The agreed JSON schema intentionally has no IDs.
            key={`${index}-${source.url}`}
            className="p-3 rounded-xl bg-gray-50 border border-gray-200"
          >
            <div className="flex gap-2 items-start">
              <div className="flex-1">
                <Input
                  className="text-sm bg-white"
                  value={source.name}
                  placeholder="出典名"
                  onChange={event => {
                    const next = [...sources];
                    next[index] = { ...source, name: event.target.value };
                    onChange(next);
                  }}
                />
                <Input
                  className="mt-2 text-sm bg-white"
                  value={source.url}
                  placeholder="https://..."
                  onChange={event => {
                    const next = [...sources];
                    next[index] = { ...source, url: event.target.value };
                    onChange(next);
                  }}
                />
                <Textarea
                  className="mt-2 text-sm min-h-[80px] bg-white"
                  value={source.quote}
                  placeholder="確認に使用した原文"
                  onChange={event => {
                    const next = [...sources];
                    next[index] = { ...source, quote: event.target.value };
                    onChange(next);
                  }}
                />
              </div>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                className="text-red-700 hover:text-red-800"
                aria-label="出典を削除"
                onClick={() =>
                  onChange(
                    sources.filter((_, sourceIndex) => sourceIndex !== index),
                  )
                }
              >
                <Trash2 size={15} />
              </Button>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);

const WarningEditor = ({
  warn,
  warnReason,
  onChange,
}: {
  warn: boolean;
  warnReason: string | null;
  onChange: (warn: boolean, warnReason: string | null) => void;
}) => (
  <div
    className={`mt-4 p-3 rounded-xl ${warn ? "bg-orange-50" : "bg-gray-50"}`}
  >
    <Label className="flex items-center gap-2 cursor-pointer">
      <Checkbox
        checked={warn}
        onCheckedChange={(checked: boolean | "indeterminate") =>
          onChange(checked === true, checked === true ? "" : null)
        }
      />
      <AlertTriangle size={16} color={warn ? "#c2410c" : "#6b7280"} />
      <p
        className={`text-sm font-bold ${warn ? "text-orange-900" : "text-gray-600"}`}
      >
        人間による確認が必要
      </p>
    </Label>
    {warn && (
      <Textarea
        className="mt-3 min-h-[90px] bg-white"
        value={warnReason ?? ""}
        placeholder="なぜ人間による確認が必要なのかを入力"
        onChange={event => onChange(true, event.target.value)}
      />
    )}
  </div>
);

const EvaluationEditor = ({
  categoryId,
  kind,
  title,
  tone,
  items,
  onChange,
}: {
  categoryId: ReviewCategoryId;
  kind: "good" | "bad";
  title: string;
  tone: "green" | "orange";
  items: ReviewDetailEvaluation[];
  onChange: (items: ReviewDetailEvaluation[]) => void;
}) => (
  <Card>
    <CardContent className="p-4 md:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2
          className={`text-lg font-bold font-[var(--font-heading)] ${
            tone === "green" ? "text-green-900" : "text-orange-900"
          }`}
        >
          {title}
        </h2>
        <Button
          type="button"
          size="sm"
          className={
            tone === "green"
              ? "border-green-500 text-green-900 hover:bg-green-50 hover:text-green-700"
              : "border-orange-500 text-orange-900 hover:bg-orange-50 hover:text-orange-700"
          }
          variant="outline"
          onClick={() => onChange([...items, newEvaluation()])}
        >
          <Plus size={16} />
          追加
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="mt-4 text-gray-400 text-sm">項目はありません。</p>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {items.map((item, index) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: The agreed JSON schema intentionally has no IDs.
              key={`${index}-${item.title}`}
              id={warningAnchorId(categoryId, kind, index)}
              className={`scroll-mt-6 p-4 rounded-xl border ${
                item.warn
                  ? "border-orange-300 bg-orange-50"
                  : tone === "green"
                    ? "border-green-100 bg-green-50"
                    : "border-orange-100 bg-orange-50"
              }`}
            >
              {item.warn && (
                <Alert
                  variant="destructive"
                  className="mb-4 bg-orange-50 border-orange-300 text-orange-900"
                >
                  <AlertTriangle className="size-4" />
                  <AlertTitle className="text-xs font-bold">
                    人間による確認が必要です
                  </AlertTitle>
                  <AlertDescription className="mt-1 text-xs leading-relaxed">
                    {item.warnReason}
                  </AlertDescription>
                </Alert>
              )}
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <Label>
                    見出し<span className="ml-1 text-red-700">必須</span>
                  </Label>
                  <Input
                    className="bg-white"
                    value={item.title}
                    onChange={event => {
                      const next = [...items];
                      next[index] = { ...item, title: event.target.value };
                      onChange(next);
                    }}
                  />
                </div>
                <Button
                  type="button"
                  className="mt-5 text-red-700 hover:text-red-800"
                  size="sm"
                  variant="ghost"
                  aria-label={`${title}を削除`}
                  onClick={() =>
                    onChange(
                      items.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                >
                  <Trash2 size={17} />
                </Button>
              </div>
              <div className="mt-3">
                <Label>
                  説明<span className="ml-1 text-red-700">必須</span>
                </Label>
                <Textarea
                  className="min-h-[140px] bg-white"
                  value={item.description}
                  onChange={event => {
                    const next = [...items];
                    next[index] = { ...item, description: event.target.value };
                    onChange(next);
                  }}
                />
              </div>
              <SourcesEditor
                sources={item.sources}
                onChange={sources => {
                  const next = [...items];
                  next[index] = { ...item, sources };
                  onChange(next);
                }}
              />
              <WarningEditor
                warn={item.warn}
                warnReason={item.warnReason}
                onChange={(warn, warnReason) => {
                  const next = [...items];
                  next[index] = { ...item, warn, warnReason };
                  onChange(next);
                }}
              />
            </div>
          ))}
        </div>
      )}
    </CardContent>
  </Card>
);

const CoursesEditor = ({
  categoryId,
  courses,
  onChange,
}: {
  categoryId: ReviewCategoryId;
  courses: ReviewDetailCourse[];
  onChange: (courses: ReviewDetailCourse[]) => void;
}) => (
  <Card>
    <CardContent className="p-4 md:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-blue-900 font-[var(--font-heading)]">
          コース
        </h2>
        <Button
          type="button"
          size="sm"
          className="border-blue-600 text-blue-900 hover:bg-blue-50 hover:text-blue-700"
          variant="outline"
          onClick={() => onChange([...courses, newCourse()])}
        >
          <Plus size={16} />
          追加
        </Button>
      </div>
      {courses.length === 0 ? (
        <p className="mt-4 text-gray-400 text-sm">
          コースは登録されていません。
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {courses.map((course, index) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: The agreed JSON schema intentionally has no IDs.
              key={`${index}-${course.name}`}
              id={warningAnchorId(categoryId, "courses", index)}
              className={`scroll-mt-6 p-4 rounded-xl border ${course.warn ? "border-orange-300 bg-orange-50" : "border-blue-100 bg-blue-50"}`}
            >
              {course.warn && (
                <Alert
                  variant="destructive"
                  className="mb-4 bg-orange-50 border-orange-300 text-orange-900"
                >
                  <AlertTriangle className="size-4" />
                  <AlertTitle className="text-xs font-bold">
                    人間による確認が必要です
                  </AlertTitle>
                  <AlertDescription className="mt-1 text-xs leading-relaxed">
                    {course.warnReason}
                  </AlertDescription>
                </Alert>
              )}
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <Label>
                    コース名<span className="ml-1 text-red-700">必須</span>
                  </Label>
                  <Input
                    className="bg-white"
                    value={course.name}
                    onChange={event => {
                      const next = [...courses];
                      next[index] = { ...course, name: event.target.value };
                      onChange(next);
                    }}
                  />
                </div>
                <Button
                  type="button"
                  className="mt-5 text-red-700 hover:text-red-800"
                  size="sm"
                  variant="ghost"
                  aria-label="コースを削除"
                  onClick={() =>
                    onChange(
                      courses.filter((_, courseIndex) => courseIndex !== index),
                    )
                  }
                >
                  <Trash2 size={17} />
                </Button>
              </div>
              <div className="mt-3">
                <Label>
                  説明<span className="ml-1 text-red-700">必須</span>
                </Label>
                <Textarea
                  className="min-h-[130px] bg-white"
                  value={course.description}
                  onChange={event => {
                    const next = [...courses];
                    next[index] = {
                      ...course,
                      description: event.target.value,
                    };
                    onChange(next);
                  }}
                />
              </div>
              <SourcesEditor
                sources={course.sources}
                onChange={sources => {
                  const next = [...courses];
                  next[index] = { ...course, sources };
                  onChange(next);
                }}
              />
              <WarningEditor
                warn={course.warn}
                warnReason={course.warnReason}
                onChange={(warn, warnReason) => {
                  const next = [...courses];
                  next[index] = { ...course, warn, warnReason };
                  onChange(next);
                }}
              />
            </div>
          ))}
        </div>
      )}
    </CardContent>
  </Card>
);

const ModeButton = ({
  active,
  icon,
  children,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
}) => (
  <Button
    type="button"
    size="sm"
    variant={active ? "default" : "ghost"}
    onClick={onClick}
  >
    {icon}
    {children}
  </Button>
);

export function ReviewEditWorkspace({
  resorts,
  initialResortId,
  initialData,
}: {
  resorts: ReviewResortOption[];
  initialResortId: string | null;
  initialData: ReviewEditData | null;
}) {
  const [selectedResortId, setSelectedResortId] = useState(initialResortId);
  const [data, setData] = useState(initialData);
  const [savedSnapshot, setSavedSnapshot] = useState(
    initialData ? JSON.stringify(initialData) : "",
  );
  const [selectedCategory, setSelectedCategory] =
    useState<ReviewCategoryId>("beginner");
  const [mode, setMode] = useState<EditorMode>("detail");
  const [filter, setFilter] = useState("");
  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [selectResortDialogOpen, setSelectResortDialogOpen] = useState(false);
  const [pendingResortId, setPendingResortId] = useState<string | null>(null);

  const dirty = data ? JSON.stringify(data) !== savedSnapshot : false;
  const filteredResorts = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase("ja");
    if (!query) return resorts;
    return resorts.filter(
      resort =>
        resort.name.toLocaleLowerCase("ja").includes(query) ||
        resort.resortId.includes(query),
    );
  }, [filter, resorts]);
  const selectedResort = resorts.find(
    resort => resort.resortId === selectedResortId,
  );
  const warnings = useMemo<ReviewWarning[]>(() => {
    if (!data) return [];
    return REVIEW_CATEGORY_IDS.flatMap(categoryId => {
      const category = data.detail[categoryId];
      return (["good", "bad", "courses"] as const).flatMap(kind =>
        category[kind].flatMap((item, index) =>
          item.warn
            ? [
                {
                  categoryId,
                  kind,
                  index,
                  label: "title" in item ? item.title : item.name,
                  reason: item.warnReason ?? "警告理由が入力されていません。",
                },
              ]
            : [],
        ),
      );
    });
  }, [data]);
  const warningCountByCategory = useMemo(
    () =>
      Object.fromEntries(
        REVIEW_CATEGORY_IDS.map(categoryId => [
          categoryId,
          warnings.filter(warning => warning.categoryId === categoryId).length,
        ]),
      ) as Record<ReviewCategoryId, number>,
    [warnings],
  );

  const updateDetail = (detail: ReviewDetailFile) => {
    if (!data) return;
    setData({ ...data, detail });
    setMessage(null);
  };

  const updateArticle = (article: ReviewArticleFile) => {
    if (!data) return;
    setData({ ...data, article });
    setMessage(null);
  };

  const selectResort = (resortId: string) => {
    if (resortId === selectedResortId) return;
    if (dirty) {
      setPendingResortId(resortId);
      setSelectResortDialogOpen(true);
      return;
    }
    setMessage(null);
    startTransition(async () => {
      try {
        const next = await loadReviewForEdit(resortId);
        setSelectedResortId(resortId);
        setData(next);
        setSavedSnapshot(JSON.stringify(next));
      } catch {
        setMessage({
          tone: "error",
          text: "レビューデータを読み込めませんでした。",
        });
      }
    });
  };

  const handleSelectResortConfirm = () => {
    const resortId = pendingResortId;
    if (!resortId) {
      setSelectResortDialogOpen(false);
      setPendingResortId(null);
      return;
    }
    setMessage(null);
    startTransition(async () => {
      try {
        const next = await loadReviewForEdit(resortId);
        setSelectedResortId(resortId);
        setData(next);
        setSavedSnapshot(JSON.stringify(next));
      } catch {
        setMessage({
          tone: "error",
          text: "レビューデータを読み込めませんでした。",
        });
      }
    });
    setSelectResortDialogOpen(false);
    setPendingResortId(null);
  };

  const save = () => {
    if (!data || !selectedResortId) return;
    setMessage(null);
    startTransition(async () => {
      const result = await saveReviewFiles({
        resortId: selectedResortId,
        ...data,
      });
      if (result.ok) {
        setData(result.data);
        setSavedSnapshot(JSON.stringify(result.data));
        setMessage({ tone: "success", text: "2つのJSONを保存しました。" });
      } else {
        setMessage({ tone: "error", text: result.errors.join("\n") });
      }
    });
  };

  const openWarning = (warning: ReviewWarning) => {
    setSelectedCategory(warning.categoryId);
    setMode("detail");
    window.setTimeout(() => {
      document
        .getElementById(
          warningAnchorId(warning.categoryId, warning.kind, warning.index),
        )
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  const detailCategory = data?.detail[selectedCategory];
  const articleCategory = data?.article[selectedCategory];

  return (
    <div className="h-[100dvh] bg-gray-100 text-gray-900 overflow-hidden flex">
      {/* §15: lg 未満では 40vw 上限でサイドバーを縮小し，メイン（エディタ）に幅を回す */}
      <aside className="w-[min(230px,40vw)] lg:w-[280px] flex-shrink-0 bg-[var(--sidebar-dark)] text-white overflow-y-auto border-r border-white/20">
        <div className="p-5 sticky top-0 z-10 bg-[var(--sidebar-dark)]">
          <p className="text-blue-200 text-xs font-bold">RUSUTSU DATA TOOLS</p>
          <h1 className="mt-1 text-xl font-bold font-[var(--font-heading)]">
            レビュー編集
          </h1>
          <Input
            className="mt-4 text-sm bg-white text-gray-900 border-transparent"
            value={filter}
            placeholder="スキー場を検索"
            onChange={event => setFilter(event.target.value)}
          />
        </div>
        <div className="px-3 pb-6 flex flex-col gap-1">
          {filteredResorts.map(resort => {
            const selected = selectedResortId === resort.resortId;
            return (
              <Button
                key={resort.resortId}
                type="button"
                className={`h-auto min-h-[58px] px-3 py-2.5 justify-start text-left whitespace-normal text-white ${
                  selected
                    ? "bg-blue-500 hover:bg-blue-500"
                    : "bg-transparent hover:bg-white/20"
                }`}
                disabled={isPending}
                onClick={() => selectResort(resort.resortId)}
              >
                <div className="w-full">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold font-[var(--font-heading)]">
                      {resort.name}
                    </p>
                    {resort.warningCount > 0 && (
                      <div className="flex items-center gap-1 text-orange-200 text-xs">
                        <AlertTriangle size={13} />
                        {resort.warningCount}
                      </div>
                    )}
                  </div>
                  <p
                    className={cn(
                      "mt-1 text-[0.6875rem]",
                      selected ? "text-blue-200" : "text-gray-400",
                    )}
                  >
                    {resort.resortId}
                  </p>
                </div>
              </Button>
            );
          })}
        </div>
      </aside>

      <div className="min-w-0 flex-1 flex flex-col">
        {/* §18 共通: 狭い幅で折り返す */}
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 lg:px-7 py-3 bg-white border-b border-gray-200">
          <div className="min-w-0">
            <p className="text-gray-500 text-xs font-bold">
              {selectedResortId ?? "スキー場未選択"}
            </p>
            <h2 className="text-lg font-bold truncate font-[var(--font-heading)]">
              {selectedResort?.name ?? "レビューデータがありません"}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {dirty && (
              <p className="text-orange-900 text-xs font-bold">未保存</p>
            )}
            <Button
              type="button"
              variant="default"
              disabled={!data || !dirty || isPending}
              onClick={save}
            >
              <Save size={17} />
              保存
            </Button>
          </div>
        </header>

        <div className="px-4 lg:px-7 pt-4 bg-white">
          <div className="flex items-center justify-between gap-4">
            <div className="flex gap-1">
              <ModeButton
                active={mode === "warnings"}
                icon={<AlertTriangle size={17} />}
                onClick={() => setMode("warnings")}
              >
                警告一覧
                {warnings.length > 0 && (
                  <span
                    className={cn(
                      "ml-1 px-1.5 rounded-full text-[0.6875rem]",
                      mode === "warnings"
                        ? "bg-white/30 text-white"
                        : "bg-orange-200 text-orange-900",
                    )}
                  >
                    {warnings.length}
                  </span>
                )}
              </ModeButton>
              <ModeButton
                active={mode === "detail"}
                icon={<FileSearch size={17} />}
                onClick={() => setMode("detail")}
              >
                調査詳細
              </ModeButton>
              <ModeButton
                active={mode === "article"}
                icon={<BookOpenText size={17} />}
                onClick={() => setMode("article")}
              >
                記事
              </ModeButton>
            </div>
            {message && (
              <div
                className={cn(
                  "flex items-center gap-2",
                  message.tone === "success"
                    ? "text-green-900"
                    : "text-red-700",
                )}
              >
                {message.tone === "success" && <Check size={16} />}
                <p className="whitespace-pre-wrap text-xs font-bold">
                  {message.text}
                </p>
              </div>
            )}
          </div>
          <div className="mt-3 flex gap-1 overflow-x-auto border-b border-gray-200">
            {REVIEW_CATEGORY_IDS.map(categoryId => (
              <Button
                key={categoryId}
                type="button"
                variant={selectedCategory === categoryId ? "default" : "ghost"}
                className={`flex-shrink-0 text-sm rounded-tl-lg rounded-tr-lg ${
                  selectedCategory !== categoryId
                    ? "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    : ""
                }`}
                onClick={() => setSelectedCategory(categoryId)}
              >
                {REVIEW_CATEGORY_LABELS[categoryId]}
                {warningCountByCategory[categoryId] > 0 && (
                  <Badge
                    variant="secondary"
                    className="ml-1 rounded-full bg-orange-100 text-orange-900 text-[0.6875rem] font-bold"
                  >
                    {warningCountByCategory[categoryId]}
                  </Badge>
                )}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 lg:p-7">
          {!data || !detailCategory || !articleCategory ? (
            <p className="text-gray-500">
              編集するスキー場を選択してください。
            </p>
          ) : mode === "warnings" ? (
            <div className="flex flex-col gap-4 max-w-[1000px] mx-auto">
              <Card>
                <CardContent className="p-4 md:p-5">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "w-10 h-10 items-center justify-center rounded-xl flex",
                        warnings.length > 0
                          ? "bg-orange-200 text-orange-900"
                          : "bg-green-200 text-green-900",
                      )}
                    >
                      {warnings.length > 0 ? (
                        <AlertTriangle size={21} />
                      ) : (
                        <Check size={21} />
                      )}
                    </div>
                    <div>
                      <h2 className="text-lg font-bold font-[var(--font-heading)]">
                        警告一覧
                      </h2>
                      <p className="mt-1 text-gray-600 text-sm">
                        {warnings.length > 0
                          ? `人間による確認が必要な項目が${warnings.length}件あります。`
                          : "人間による確認が必要な項目はありません。"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              {warnings.map(warning => (
                <Button
                  key={warningAnchorId(
                    warning.categoryId,
                    warning.kind,
                    warning.index,
                  )}
                  type="button"
                  className="h-auto p-0 block text-left whitespace-normal bg-transparent hover:bg-transparent"
                  onClick={() => openWarning(warning)}
                >
                  <Card>
                    <CardContent className="w-full p-4 md:p-5 border-orange-300 hover:border-orange-500 hover:shadow-md">
                      <div className="flex items-start gap-3">
                        <AlertTriangle size={19} color="#c2410c" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge
                              variant="secondary"
                              className="rounded-full bg-blue-50 text-blue-900 text-xs font-bold"
                            >
                              {REVIEW_CATEGORY_LABELS[warning.categoryId]}
                            </Badge>
                            <Badge
                              variant="secondary"
                              className="rounded-full bg-gray-100 text-gray-700 text-xs font-bold"
                            >
                              {WARNING_KIND_LABELS[warning.kind]}
                            </Badge>
                          </div>
                          <p className="mt-3 text-gray-900 font-bold font-[var(--font-heading)]">
                            {warning.label || "見出し未入力"}
                          </p>
                          <p className="mt-2 text-orange-900 text-sm leading-relaxed">
                            {warning.reason}
                          </p>
                          <p className="mt-3 text-blue-900 text-xs font-bold">
                            調査詳細の該当項目を開く
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Button>
              ))}
            </div>
          ) : mode === "detail" ? (
            <div className="flex flex-col gap-5 max-w-[1100px] mx-auto">
              {warningCountByCategory[selectedCategory] > 0 && (
                <Alert className="rounded-2xl bg-orange-50 border-orange-300 text-orange-900">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle className="text-sm font-bold">
                    このカテゴリには確認が必要な項目が
                    {warningCountByCategory[selectedCategory]}件あります
                  </AlertTitle>
                  <AlertDescription className="mt-1 text-xs">
                    オレンジ色のカードに警告理由を表示しています。
                  </AlertDescription>
                </Alert>
              )}
              <Card>
                <CardContent className="p-4 md:p-5">
                  <h2 className="text-lg font-bold font-[var(--font-heading)]">
                    調査情報
                  </h2>
                  <div className="mt-4 flex gap-4 flex-col md:flex-row">
                    <div className="w-full md:w-[220px]">
                      <Label>
                        調査日<span className="ml-1 text-red-700">必須</span>
                      </Label>
                      <Input
                        type="date"
                        value={data.detail.research.date}
                        onChange={event =>
                          updateDetail({
                            ...data.detail,
                            research: {
                              ...data.detail.research,
                              date: event.target.value,
                            },
                          })
                        }
                      />
                    </div>
                    <div className="flex-1">
                      <Label>
                        調査に関する報告
                        <span className="ml-1 text-red-700">必須</span>
                      </Label>
                      <Textarea
                        className="min-h-[130px]"
                        value={data.detail.research.note}
                        onChange={event =>
                          updateDetail({
                            ...data.detail,
                            research: {
                              ...data.detail.research,
                              note: event.target.value,
                            },
                          })
                        }
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <EvaluationEditor
                categoryId={selectedCategory}
                kind="good"
                title="良い評価"
                tone="green"
                items={detailCategory.good}
                onChange={good =>
                  updateDetail({
                    ...data.detail,
                    [selectedCategory]: { ...detailCategory, good },
                  })
                }
              />
              <EvaluationEditor
                categoryId={selectedCategory}
                kind="bad"
                title="悪い評価"
                tone="orange"
                items={detailCategory.bad}
                onChange={bad =>
                  updateDetail({
                    ...data.detail,
                    [selectedCategory]: { ...detailCategory, bad },
                  })
                }
              />
              <CoursesEditor
                categoryId={selectedCategory}
                courses={detailCategory.courses}
                onChange={courses =>
                  updateDetail({
                    ...data.detail,
                    [selectedCategory]: { ...detailCategory, courses },
                  })
                }
              />
            </div>
          ) : (
            <div className="flex flex-col gap-5 max-w-[1000px] mx-auto">
              <Card>
                <CardContent className="p-4 md:p-5">
                  <Label>
                    スキー場全体の記事（full）
                    <span className="ml-1 text-red-700">必須</span>
                  </Label>
                  <Textarea
                    className="min-h-[260px]"
                    value={data.article.full}
                    onChange={event =>
                      updateArticle({
                        ...data.article,
                        full: event.target.value,
                      })
                    }
                  />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 md:p-5">
                  <div className="flex items-end gap-4">
                    <div>
                      <Label>評価</Label>
                      <Select
                        value={articleCategory.score ?? ""}
                        onValueChange={value =>
                          updateArticle({
                            ...data.article,
                            [selectedCategory]: {
                              ...articleCategory,
                              score: (value as "◎" | "○" | "△") || null,
                            },
                          })
                        }
                      >
                        <SelectTrigger className="h-10 w-[110px]">
                          <SelectValue placeholder="未評価" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">未評価</SelectItem>
                          <SelectItem value="◎">◎</SelectItem>
                          <SelectItem value="○">○</SelectItem>
                          <SelectItem value="△">△</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <p className="text-gray-500 text-sm">
                        {REVIEW_CATEGORY_LABELS[selectedCategory]}向け記事
                      </p>
                    </div>
                  </div>
                  <div className="mt-5">
                    <Label>良い点（good）</Label>
                    <Textarea
                      className="min-h-[180px]"
                      value={articleCategory.good}
                      onChange={event =>
                        updateArticle({
                          ...data.article,
                          [selectedCategory]: {
                            ...articleCategory,
                            good: event.target.value,
                          },
                        })
                      }
                    />
                  </div>
                  <div className="mt-5">
                    <Label>悪い点（bad）</Label>
                    <Textarea
                      className="min-h-[180px]"
                      value={articleCategory.bad}
                      onChange={event =>
                        updateArticle({
                          ...data.article,
                          [selectedCategory]: {
                            ...articleCategory,
                            bad: event.target.value,
                          },
                        })
                      }
                    />
                  </div>
                  <div className="mt-5">
                    <div className="flex items-center justify-between">
                      <Label>コース（courses）</Label>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          updateArticle({
                            ...data.article,
                            [selectedCategory]: {
                              ...articleCategory,
                              courses: [
                                ...articleCategory.courses,
                                { name: "", description: "" },
                              ],
                            },
                          })
                        }
                      >
                        <Plus size={15} />
                        コースを追加
                      </Button>
                    </div>
                    <div className="mt-2 flex flex-col gap-3">
                      {articleCategory.courses.map((course, index) => (
                        <div
                          // biome-ignore lint/suspicious/noArrayIndexKey: The agreed JSON schema intentionally has no IDs.
                          key={`${index}-${course.name}`}
                          className="p-3 rounded-xl border border-gray-200 bg-gray-50"
                        >
                          <div className="flex gap-2 items-start">
                            <div className="flex-1">
                              <Input
                                className="bg-white"
                                value={course.name}
                                placeholder="コース名"
                                onChange={event => {
                                  const courses = [...articleCategory.courses];
                                  courses[index] = {
                                    ...course,
                                    name: event.target.value,
                                  };
                                  updateArticle({
                                    ...data.article,
                                    [selectedCategory]: {
                                      ...articleCategory,
                                      courses,
                                    },
                                  });
                                }}
                              />
                              <Textarea
                                className="mt-2 min-h-[110px] bg-white"
                                value={course.description}
                                placeholder="記事用のコース説明"
                                onChange={event => {
                                  const courses = [...articleCategory.courses];
                                  courses[index] = {
                                    ...course,
                                    description: event.target.value,
                                  };
                                  updateArticle({
                                    ...data.article,
                                    [selectedCategory]: {
                                      ...articleCategory,
                                      courses,
                                    },
                                  });
                                }}
                              />
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="text-red-700 hover:text-red-800"
                              aria-label="記事のコースを削除"
                              onClick={() =>
                                updateArticle({
                                  ...data.article,
                                  [selectedCategory]: {
                                    ...articleCategory,
                                    courses: articleCategory.courses.filter(
                                      (_, courseIndex) => courseIndex !== index,
                                    ),
                                  },
                                })
                              }
                            >
                              <Trash2 size={16} />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
        <ConfirmDialog
          open={selectResortDialogOpen}
          onOpenChange={setSelectResortDialogOpen}
          title="移動確認"
          description="保存していない変更があります。破棄して移動しますか？"
          onConfirm={handleSelectResortConfirm}
          confirmLabel="移動する"
        />
      </div>
    </div>
  );
}
