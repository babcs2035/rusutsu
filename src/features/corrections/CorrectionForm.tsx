"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { submitCorrection } from "./actions";
import { withAnonymousCheck } from "./anonymousCheck";
import {
  type CorrectionEntry,
  CorrectionGeometryEditor,
} from "./CorrectionGeometryEditor";

type Entry = CorrectionEntry;
type Screen =
  | "home"
  | "resort"
  | "course"
  | "lift"
  | "ticket"
  | "source"
  | "other";
const basicFields = [
  "nameJa",
  "nameEn",
  "shortName",
  "website",
  "descriptionShort",
  "descriptionLong",
  "courseImages",
  "outlineImages",
];
const fieldLabels: Record<string, string> = {
  nameJa: "スキー場名",
  nameEn: "英語名",
  shortName: "略称",
  website: "公式サイトURL",
  descriptionShort: "紹介文",
  descriptionLong: "詳細説明",
  courseImages: "コース画像URL",
  outlineImages: "施設画像URL",
  note: "補足説明",
  image: "画像URL",
  youtubeUrl: "YouTube URL",
  searchWord: "検索用キーワード",
  maxWidth: "最大幅",
  minWidth: "最小幅",
  vertical: "標高差",
  top: "山頂駅の標高",
  bottom: "山麓駅の標高",
  maker: "メーカー",
  year: "設置年",
  link: "関連リンク",
  signal: "信号設備",
  name: "名称",
  level: "難易度",
  distance: "距離",
  avg: "平均斜度",
  max: "最大斜度",
  piste: "圧雪",
  morning: "早朝営業",
  night: "ナイター営業",
  type: "リフトの種類",
  speed: "速度",
  capacity: "定員",
  hood: "屋根",
  footrest: "フットレスト",
  oilShield: "オイルシールド",
  towers: "支柱数",
  coordinates: "線の位置",
  pisteSegments: "圧雪の区間設定",
  morningSegments: "早朝営業の区間設定",
  nightSegments: "ナイターの区間設定",
};
const resortDraftFields = [
  "nameJa",
  "nameEn",
  "shortName",
  "website",
  "descriptionShort",
  "descriptionLong",
  "courseImages",
  "outlineImages",
];

export function CorrectionForm({
  resortId,
  resortName,
  context,
  returnTo,
  kind,
  features = [],
  currentValues = {},
  center,
}: {
  resortId: string;
  resortName: string;
  context: Record<string, unknown>;
  returnTo: string;
  kind?: string;
  features?: Array<{
    id: string;
    name: string;
    kind: "slope" | "lift";
    coordinates: number[][];
    properties: Record<string, unknown>;
  }>;
  currentValues?: Record<string, unknown>;
  center?: [number, number];
}) {
  const router = useRouter();
  const directKind =
    context.targetKind === "slope" || context.targetKind === "lift"
      ? context.targetKind
      : context.entityKind === "course"
        ? "slope"
        : context.entityKind === "lift"
          ? "lift"
          : undefined;
  const directId =
    typeof context.targetId === "string"
      ? context.targetId
      : typeof context.courseId === "string"
        ? context.courseId
        : typeof context.liftId === "string"
          ? context.liftId
          : "";
  const directScreen: Screen | null = directKind
    ? directKind === "slope"
      ? "course"
      : "lift"
    : kind === "ticket"
      ? "ticket"
      : kind === "source"
        ? "source"
        : null;
  const [screen, setScreen] = useState<Screen>(directScreen ?? "home");
  const [subscreen, setSubscreen] = useState("info");
  const [targetId, setTargetId] = useState(directId);
  const [field, setField] = useState("nameJa");
  const [value, setValue] = useState("");
  const [comment, setComment] = useState("");
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [operationKey, setOperationKey] = useState("");
  const [items, setItems] = useState<Entry[]>([]);
  const [error, setError] = useState("");
  const [busy, startTransition] = useTransition();
  const [step, setStep] = useState<"edit" | "review">("edit");
  const [draftLoaded, setDraftLoaded] = useState<string | null>(null);
  const screenKey = `${resortId}:${directScreen ?? screen}:${targetId || "all"}:${subscreen}`;
  const draftKey = `correction-draft:${screenKey}`;
  const targetKind =
    screen === "course" ? "slope" : screen === "lift" ? "lift" : screen;
  const currentFeature = features.find(item => item.id === targetId);
  const currentValue =
    screen === "resort"
      ? currentValues[field]
      : currentFeature?.properties[field];
  const editableFields =
    screen === "resort"
      ? basicFields
      : screen === "course"
        ? [
            "name",
            "level",
            "distance",
            "avg",
            "max",
            "piste",
            "morning",
            "night",
            "note",
            "image",
            "youtubeUrl",
            "searchWord",
            "maxWidth",
            "minWidth",
          ]
        : [
            "name",
            "type",
            "speed",
            "capacity",
            "hood",
            "footrest",
            "oilShield",
            "towers",
            "distance",
            "morning",
            "night",
            "vertical",
            "top",
            "bottom",
            "maker",
            "year",
            "note",
            "link",
            "image",
            "youtubeUrl",
            "signal",
          ];
  const selectOptions = useMemo(() => {
    if (field === "level")
      return ["初級", "初中級", "中級", "中上級", "上級", "未設定"];
    if (field === "type")
      return [
        "リフト",
        "ゴンドラ",
        "ロープウェイ",
        "クワッド",
        "トリプル",
        "ペア",
        "シングル",
        "その他",
        "未設定",
      ];
    if (field === "speed") return ["低速", "高速", "未設定"];
    if (field === "signal") return ["○", "×", "未設定"];
    return [];
  }, [field]);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(draftKey);
      if (!stored) {
        setOperationKey(crypto.randomUUID());
        setDraftLoaded(draftKey);
        return;
      }
      const draft = JSON.parse(stored) as {
        savedAt: number;
        value?: string;
        comment?: string;
        operationKey?: string;
        items?: Entry[];
      };
      if (Date.now() - draft.savedAt > 86400000) {
        localStorage.removeItem(draftKey);
        setOperationKey(crypto.randomUUID());
      } else {
        setValue(draft.value ?? "");
        setComment(draft.comment ?? "");
        setOperationKey(draft.operationKey ?? crypto.randomUUID());
        setItems(draft.items ?? []);
      }
      setDraftLoaded(draftKey);
    } catch {
      localStorage.removeItem(draftKey);
      setOperationKey(crypto.randomUUID());
      setDraftLoaded(draftKey);
    }
  }, [draftKey]);
  useEffect(() => {
    if (draftLoaded === draftKey)
      localStorage.setItem(
        draftKey,
        JSON.stringify({
          savedAt: Date.now(),
          value,
          comment,
          operationKey,
          items,
        }),
      );
  }, [draftKey, draftLoaded, value, comment, operationKey, items]);

  const goScreen = (next: Screen) => {
    setPhotoFiles([]);
    setScreen(next);
    setTargetId("");
    setField(next === "resort" ? "nameJa" : "name");
    setSubscreen("info");
    setItems([]);
    setValue("");
  };
  const addFieldItem = () => {
    const proposed =
      value === "__null"
        ? null
        : field === "courseImages" || field === "outlineImages"
          ? value
              .split("\n")
              .map(item => item.trim())
              .filter(Boolean)
          : [
                "distance",
                "avg",
                "max",
                "capacity",
                "towers",
                "maxWidth",
                "minWidth",
                "vertical",
                "top",
                "bottom",
                "year",
              ].includes(field)
            ? Number(value)
            : value;
    const entry: Entry = {
      targetKind: targetKind as Entry["targetKind"],
      targetName: currentFeature?.name ?? resortName,
      ...(targetId ? { targetId } : {}),
      field,
      before: currentValue,
      proposed,
    };
    setItems(current => [
      ...current.filter(item => item.field !== entry.field),
      entry,
    ]);
  };
  const submit = (_formData: FormData) =>
    startTransition(async () => {
      if (!items.length) {
        setError("変更したい項目を選んでください。");
        return;
      }
      const photos = new FormData();
      for (const file of photoFiles) photos.append("photos", file);
      const result = await withAnonymousCheck(proof =>
        submitCorrection(
          { resortId, context, returnTo, items, comment, operationKey, proof },
          photos,
        ),
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      localStorage.removeItem(draftKey);
      router.push(
        `/corrections/${resortId}/complete?id=${encodeURIComponent(result.requestId)}&returnTo=${encodeURIComponent(returnTo)}`,
      );
    });
  const matching = features.filter(feature =>
    screen === "course" ? feature.kind === "slope" : feature.kind === "lift",
  );
  const isMapScreen =
    (screen === "course" || screen === "lift") && subscreen === "position";
  const isSegments = screen === "course" && subscreen === "segments";

  return (
    <main className="mx-auto min-h-dvh max-w-2xl p-4 pb-10">
      <header className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500">匿名で送信 · ログイン不要</p>
          <h1 className="text-lg font-bold">{resortName}の情報を修正</h1>
        </div>
        <Link
          href={returnTo}
          className="shrink-0 text-sm text-blue-700 underline"
        >
          戻る
        </Link>
      </header>
      <p className="mb-3 text-sm text-slate-600">
        提案は公開されず、管理者が確認してから反映されます。
      </p>
      {error && (
        <p
          role="alert"
          className="mb-3 rounded bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      {screen === "home" ? (
        <section className="grid grid-cols-2 gap-2">
          {(
            [
              ["resort", "基本情報"],
              ["course", "コース"],
              ["lift", "リフト"],
              ["ticket", "リフト券"],
              ["source", "出典"],
              ["other", "その他"],
            ] as [Screen, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => goScreen(key)}
              className="min-h-16 rounded-lg border bg-white p-3 text-left font-medium"
            >
              {label}の修正を提案
            </button>
          ))}
        </section>
      ) : (
        <>
          <button
            type="button"
            className="mb-3 text-sm text-blue-700 underline"
            onClick={() => setScreen("home")}
          >
            ‹ 修正内容の種類を選び直す
          </button>
          <form action={submit}>
            {screen === "resort" && (
              <section className="space-y-3 rounded-lg border p-3">
                <h2 className="font-semibold">基本情報</h2>
                <Link
                  href={`/corrections/${resortId}/links?returnTo=${encodeURIComponent(returnTo)}`}
                  className="text-sm text-blue-700 underline"
                >
                  SNS・ゲレンデマップ・スクールなどの関連リンクを修正
                </Link>
                <FieldSelect
                  value={field}
                  fields={resortDraftFields}
                  onChange={next => {
                    setField(next);
                    setValue("");
                  }}
                />
                <CurrentValue value={currentValue} />
                <ValueInput
                  field={field}
                  value={value}
                  onChange={setValue}
                  options={selectOptions}
                />
                <Button type="button" onClick={addFieldItem}>
                  この項目を修正
                </Button>
              </section>
            )}
            {(screen === "course" || screen === "lift") && (
              <section className="space-y-3 rounded-lg border p-3">
                <h2 className="font-semibold">
                  {screen === "course" ? "コース" : "リフト"}
                </h2>
                {directKind ? (
                  <p className="font-medium">
                    {currentFeature?.name ??
                      String(context.targetName ?? "選択した対象")}
                  </p>
                ) : (
                  <label className="block text-sm font-medium">
                    対象
                    <Select
                      value={targetId}
                      items={[
                        { value: "", label: "選択してください" },
                        ...matching.map(item => ({
                          value: item.id,
                          label: item.name,
                        })),
                      ]}
                      onValueChange={value => {
                        if (value === null) return;
                        setTargetId(value);
                        setItems([]);
                        setValue("");
                      }}
                    >
                      <SelectTrigger
                        aria-label="対象"
                        className="mt-1 h-10 w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">選択してください</SelectItem>
                        {matching.map(item => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                )}
                <div className="grid grid-cols-3 gap-1">
                  {[
                    ["position", "位置"],
                    ...(targetId ? [["info", "属性"]] : []),
                    ...(screen === "course" && targetId
                      ? [["segments", "区間範囲"]]
                      : []),
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setSubscreen(key);
                        setItems([]);
                      }}
                      className={`rounded border px-2 py-2 text-sm ${subscreen === key ? "bg-slate-900 text-white" : "bg-white"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSubscreen("bulk");
                    setItems([]);
                  }}
                  className="rounded border px-2 py-2 text-sm"
                >
                  一括で状態を修正
                </button>
                {isMapScreen && (
                  <CorrectionGeometryEditor
                    targetKind={screen === "course" ? "slope" : "lift"}
                    center={center}
                    features={features.filter(
                      item =>
                        item.kind === (screen === "course" ? "slope" : "lift"),
                    )}
                    items={items}
                    onItemsChange={setItems}
                  />
                )}
                {((isSegments && targetId) || subscreen === "bulk") && (
                  <CorrectionGeometryEditor
                    targetKind={screen === "course" ? "slope" : "lift"}
                    center={center}
                    features={features.filter(
                      item =>
                        item.kind === (screen === "course" ? "slope" : "lift"),
                    )}
                    items={items}
                    onItemsChange={setItems}
                    mode={isSegments ? "segments" : "bulk"}
                    selectedTargetId={isSegments ? targetId : undefined}
                  />
                )}
                {subscreen === "info" && targetId && (
                  <div className="space-y-3">
                    <FieldSelect
                      value={field}
                      fields={editableFields}
                      onChange={next => {
                        setField(next);
                        setValue("");
                      }}
                    />
                    <CurrentValue value={currentValue} />
                    <ValueInput
                      field={field}
                      value={value}
                      onChange={setValue}
                      options={selectOptions}
                    />
                    <Button type="button" onClick={addFieldItem}>
                      この項目を修正
                    </Button>
                  </div>
                )}
              </section>
            )}
            {!["resort", "course", "lift"].includes(screen) && (
              <section className="space-y-3 rounded-lg border p-3">
                <h2 className="font-semibold">
                  {screen === "ticket"
                    ? "リフト券の情報"
                    : screen === "source"
                      ? "出典情報"
                      : "その他"}
                </h2>
                <p className="text-sm text-slate-600">
                  内容と確認できる情報を記入してください。管理者が確認して対応します。
                </p>
                <textarea
                  value={value}
                  onChange={event => {
                    setValue(event.target.value);
                    setItems(
                      event.target.value.trim()
                        ? [
                            {
                              targetKind: screen as Entry["targetKind"],
                              field:
                                screen === "ticket"
                                  ? "ticket-report"
                                  : screen === "source"
                                    ? "source-report"
                                    : "other-report",
                              proposed: event.target.value,
                            },
                          ]
                        : [],
                    );
                  }}
                  rows={4}
                  className="w-full rounded border p-2"
                  placeholder="確認した内容"
                />
              </section>
            )}
            {step === "review" && (
              <section className="my-3 rounded-lg border p-3">
                <h2 className="font-semibold">送信内容の確認</h2>
                <ItemsPreview items={items} />
                {photoFiles.length > 0 && (
                  <p className="mt-2 text-sm">
                    写真 {photoFiles.length}枚（管理者のみ閲覧）
                  </p>
                )}
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3"
                  onClick={() => setStep("edit")}
                >
                  内容を修正
                </Button>
              </section>
            )}
            <label className="mt-3 block text-sm font-medium">
              補足（任意）
              <textarea
                value={comment}
                onChange={event => setComment(event.target.value)}
                maxLength={5000}
                rows={2}
                className="mt-1 w-full rounded border p-2"
              />
            </label>
            {step === "edit" && (
              <label className="mt-3 block text-sm font-medium">
                写真（任意・最大3枚）
                <input
                  name="photos"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/avif"
                  multiple
                  onChange={event => {
                    const files = Array.from(event.target.files ?? []);
                    if (
                      files.length > 3 ||
                      files.some(file => file.size > 8 * 1024 * 1024)
                    ) {
                      setError("写真は1枚8MB以内、3枚までです。");
                      setPhotoFiles([]);
                      event.target.value = "";
                      return;
                    }
                    setPhotoFiles(files);
                    setError("");
                  }}
                  className="mt-1 block w-full text-sm"
                />
              </label>
            )}
            {step === "edit" ? (
              <Button
                key="review"
                className="mt-4 w-full"
                type="button"
                disabled={busy || !items.length}
                onClick={event => {
                  event.preventDefault();
                  setStep("review");
                }}
              >
                内容を確認する
              </Button>
            ) : (
              <Button
                key="submit"
                className="mt-4 w-full"
                type="submit"
                disabled={busy}
              >
                {busy ? "送信中…" : "この内容で送信"}
              </Button>
            )}
          </form>
        </>
      )}
    </main>
  );
}

function FieldSelect({
  value,
  fields,
  onChange,
}: {
  value: string;
  fields: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm font-medium">
      修正する項目
      <Select
        value={value}
        onValueChange={selected => {
          if (selected !== null) onChange(selected);
        }}
        items={fields.map(name => ({
          value: name,
          label: fieldLabels[name] ?? name,
        }))}
      >
        <SelectTrigger aria-label="修正する項目" className="mt-1 h-10 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {fields.map(name => (
            <SelectItem key={name} value={name}>
              {fieldLabels[name] ?? name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
function CurrentValue({ value }: { value: unknown }) {
  return (
    <p className="text-xs text-slate-500">
      現在の登録値:{" "}
      <span className="text-sm text-slate-800">
        {value == null
          ? "未登録"
          : Array.isArray(value)
            ? value.join("、")
            : String(value)}
      </span>
    </p>
  );
}
function ValueInput({
  field,
  value,
  onChange,
  options,
}: {
  field: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  if (
    [
      "hood",
      "footrest",
      "oilShield",
      "piste",
      "morning",
      "night",
      "signal",
    ].includes(field)
  )
    return (
      <div className="flex gap-2">
        {[
          ["○", "あり ○"],
          ...(field === "piste" ? [["△", "一部 △"]] : []),
          ["×", "なし ×"],
          ["__null", "未設定"],
        ].map(([v, label]) => (
          <Button
            key={v}
            type="button"
            variant={value === v ? "default" : "outline"}
            onClick={() => onChange(v)}
          >
            {label}
          </Button>
        ))}
      </div>
    );
  if (options.length)
    return (
      <Select
        value={value}
        items={[
          { value: "", label: "選択してください" },
          ...options.map(option => ({
            value: option === "未設定" ? "__null" : option,
            label: option,
          })),
        ]}
        onValueChange={selected => {
          if (selected !== null) onChange(selected);
        }}
      >
        <SelectTrigger aria-label="修正値" className="h-10 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">選択してください</SelectItem>
          {options.map(option => (
            <SelectItem
              key={option}
              value={option === "未設定" ? "__null" : option}
            >
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  if (
    [
      "distance",
      "avg",
      "max",
      "capacity",
      "towers",
      "maxWidth",
      "minWidth",
      "vertical",
      "top",
      "bottom",
      "year",
    ].includes(field)
  )
    return (
      <label className="block text-sm">
        新しい値
        <input
          type="number"
          min="0"
          step="any"
          value={value}
          onChange={event => onChange(event.target.value)}
          className="mt-1 h-10 w-full rounded border px-3"
        />
        <button
          type="button"
          onClick={() => onChange("__null")}
          className="mt-1 text-xs text-blue-700 underline"
        >
          未設定にする
        </button>
      </label>
    );
  if (field === "website" || field.endsWith("Images"))
    return (
      <label className="block text-sm">
        修正後の値
        <textarea
          value={value}
          onChange={event => onChange(event.target.value)}
          rows={2}
          className="mt-1 w-full rounded border p-2"
        />
      </label>
    );
  return (
    <label className="block text-sm">
      修正後の値
      <textarea
        value={value}
        onChange={event => onChange(event.target.value)}
        rows={field.includes("description") ? 4 : 2}
        className="mt-1 w-full rounded border p-2"
      />
    </label>
  );
}
function ItemsPreview({ items }: { items: Entry[] }) {
  const describe = (item: Entry, value: unknown) => {
    if (value == null || value === "") return "不明・未登録";
    if (!Array.isArray(value)) return String(value);
    if (item.field === "coordinates")
      return `${value.length}点の線（地図で確認）`;
    if (item.field.endsWith("Segments"))
      return value.length
        ? value
            .map(
              (range: { from: number; to: number; value: string }, index) =>
                `区間${index + 1}（${Math.round(range.from * 100)}〜${Math.round(range.to * 100)}%）${range.value}`,
            )
            .join("、")
        : "区間設定なし";
    return value.join("、");
  };
  return (
    <div className="mt-3 space-y-2">
      {items.map(item => (
        <div
          key={`${item.targetId ?? item.targetKind}:${item.field}:${JSON.stringify(item.proposed)}`}
          className="rounded border bg-slate-50 p-2 text-sm"
        >
          <strong>{fieldLabels[item.field] ?? item.field}</strong>
          {item.targetName && <p className="font-medium">{item.targetName}</p>}
          <p>現在: {describe(item, item.before)}</p>
          <p>
            提案:{" "}
            {Array.isArray(item.proposed)
              ? item.field === "coordinates"
                ? `${item.action === "add" ? "新しい線" : item.action === "delete" ? "削除を提案" : "位置を変更"}（${item.proposed.length}点）`
                : item.field.endsWith("Segments")
                  ? describe(item, item.proposed)
                  : item.proposed.join("、")
              : item.proposed == null
                ? "不明"
                : String(item.proposed)}
          </p>
        </div>
      ))}
    </div>
  );
}
