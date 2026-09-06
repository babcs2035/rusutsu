"use client";

import { AlertTriangle, RefreshCw, Save } from "lucide-react";
import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useFormStatus } from "react-dom";
import { adminToaster } from "@/app/admin/AdminToaster";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { AdminSkiResortRecord } from "@/server/ski-resorts/adminContract";
import {
  type ResortAdminActionState,
  updateSkiResortFromAdmin,
} from "./actions";

type ResortNumberField =
  | "latitude"
  | "longitude"
  | "topElevation"
  | "baseElevation"
  | "verticalDrop"
  | "numberOfCourses"
  | "longestCourse"
  | "steepestSlope"
  | "beginnersCoursesPercent"
  | "intermediateCoursesPercent"
  | "advancedCoursesPercent"
  | "typeNotPressed"
  | "typePressed"
  | "typeBump"
  | "angleMax"
  | "angleAvg"
  | "numberOfLifts"
  | "ropeways"
  | "gondolas"
  | "quadLifts"
  | "tripleLifts"
  | "pairLifts"
  | "singleLifts"
  | "otherLifts"
  | "liftCapacity"
  | "skiersPercent"
  | "snowboardersPercent"
  | "review";

type NumberFieldSpec = {
  name: ResortNumberField;
  label: string;
  nullable?: boolean;
  step?: string;
};

const COURSE_FIELDS: NumberFieldSpec[] = [
  { name: "topElevation", label: "最高標高 (m)" },
  { name: "baseElevation", label: "最低標高 (m)" },
  { name: "verticalDrop", label: "標高差 (m)" },
  { name: "numberOfCourses", label: "コース数" },
  { name: "longestCourse", label: "最長滑走距離 (m)" },
  { name: "steepestSlope", label: "最大斜度 (度)", nullable: true },
  { name: "beginnersCoursesPercent", label: "初級コース (%)" },
  { name: "intermediateCoursesPercent", label: "中級コース (%)" },
  { name: "advancedCoursesPercent", label: "上級コース (%)" },
  { name: "typeNotPressed", label: "非圧雪 (%)", nullable: true },
  { name: "typePressed", label: "圧雪 (%)", nullable: true },
  { name: "typeBump", label: "コブ (%)", nullable: true },
  { name: "angleMax", label: "斜度・最大 (度)", nullable: true },
  { name: "angleAvg", label: "斜度・平均 (度)", nullable: true },
];

const LIFT_FIELDS: NumberFieldSpec[] = [
  { name: "numberOfLifts", label: "リフト総数" },
  { name: "ropeways", label: "ロープウェイ" },
  { name: "gondolas", label: "ゴンドラ" },
  { name: "quadLifts", label: "クワッド" },
  { name: "tripleLifts", label: "トリプル" },
  { name: "pairLifts", label: "ペア" },
  { name: "singleLifts", label: "シングル" },
  { name: "otherLifts", label: "その他" },
  { name: "liftCapacity", label: "輸送力", nullable: true },
];

const initialActionState: ResortAdminActionState = { status: "idle" };

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
      <h2 className="text-base font-bold text-gray-900">{title}</h2>
      {description && (
        <p className="mt-1 text-xs leading-5 text-gray-500">{description}</p>
      )}
      <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {children}
      </div>
    </section>
  );
}

function TextField({
  name,
  label,
  value,
  required = false,
  type = "text",
}: {
  name: string;
  label: string;
  value: string | null;
  required?: boolean;
  type?: "text" | "url";
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        defaultValue={value ?? ""}
        required={required}
      />
    </div>
  );
}

function NumberField({
  resort,
  field,
}: {
  resort: AdminSkiResortRecord;
  field: NumberFieldSpec;
}) {
  const value = resort[field.name];
  return (
    <div className="space-y-1.5">
      <Label htmlFor={field.name}>{field.label}</Label>
      <Input
        id={field.name}
        name={field.name}
        type="number"
        min={
          field.name === "latitude"
            ? -90
            : field.name === "longitude"
              ? -180
              : 0
        }
        max={
          field.name === "latitude"
            ? 90
            : field.name === "longitude"
              ? 180
              : field.name.includes("Percent")
                ? 100
                : field.name === "review"
                  ? 5
                  : undefined
        }
        step={field.step ?? "1"}
        defaultValue={value ?? ""}
        required={!field.nullable}
      />
      {field.nullable && (
        <p className="text-xs text-gray-500">不明な場合は空欄</p>
      )}
    </div>
  );
}

function LinesField({
  name,
  label,
  values,
}: {
  name: string;
  label: string;
  values: string[];
}) {
  return (
    <div className="space-y-1.5 md:col-span-2 lg:col-span-3">
      <Label htmlFor={name}>{label}</Label>
      <Textarea
        id={name}
        name={name}
        defaultValue={values.join("\n")}
        className="min-h-24 font-mono text-xs"
      />
      <p className="text-xs text-gray-500">1行に1件入力してください。</p>
    </div>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      <Save aria-hidden="true" />
      {pending ? "保存中…" : "変更を保存"}
    </Button>
  );
}

function ResortEditForm({
  resort,
  onSaved,
}: {
  resort: AdminSkiResortRecord;
  onSaved: (resort: AdminSkiResortRecord) => void;
}) {
  const [state, formAction] = useActionState(
    updateSkiResortFromAdmin,
    initialActionState,
  );

  useEffect(() => {
    if (state.status !== "saved") return;
    adminToaster.create({ title: state.message, type: "success" });
    onSaved(state.resort);
  }, [onSaved, state]);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="id" value={resort.id} />
      <input type="hidden" name="expectedUpdatedAt" value={resort.updatedAt} />

      <section className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-gray-900">
                {resort.nameJa}
              </h2>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  resort.isActive
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-gray-200 text-gray-700"
                }`}
              >
                {resort.isActive ? "公開中" : "公開停止中"}
              </span>
            </div>
            <p className="mt-1 font-mono text-xs text-gray-500">
              ID: {resort.id}（変更不可）
            </p>
            <p className="mt-1 text-xs text-gray-500">
              最終更新: {new Date(resort.updatedAt).toLocaleString("ja-JP")}
            </p>
          </div>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <input
              name="isActive"
              type="checkbox"
              defaultChecked={resort.isActive}
              className="size-4 accent-blue-600"
            />
            <span>
              <span className="block text-sm font-bold text-gray-900">
                一般画面に公開する
              </span>
              <span className="block text-xs text-gray-500">
                OFFでもデータは削除されません
              </span>
            </span>
          </label>
        </div>
      </section>

      <FormSection
        title="基本情報"
        description="短縮名は地図や比較表に表示されます。空欄の場合は名称（日本語）を使います。"
      >
        <TextField
          name="shortName"
          label="短縮名（任意）"
          value={resort.shortName}
        />
        <TextField
          name="nameJa"
          label="名称（日本語）"
          value={resort.nameJa}
          required
        />
        <TextField
          name="nameEn"
          label="名称（英語）"
          value={resort.nameEn}
          required
        />
        <TextField
          name="prefecture"
          label="都道府県"
          value={resort.prefecture}
          required
        />
        <TextField name="town" label="市区町村" value={resort.town} required />
        <NumberField
          resort={resort}
          field={{ name: "latitude", label: "緯度", step: "any" }}
        />
        <NumberField
          resort={resort}
          field={{ name: "longitude", label: "経度", step: "any" }}
        />
        <TextField
          name="website"
          label="公式サイト"
          value={resort.website}
          type="url"
        />
        <TextField
          name="condition"
          label="コンディション"
          value={resort.condition}
        />
        <TextField
          name="status"
          label="既存ステータス欄"
          value={resort.status}
        />
        <NumberField
          resort={resort}
          field={{
            name: "review",
            label: "評価 (0〜5)",
            nullable: true,
            step: "0.1",
          }}
        />
        <NumberField
          resort={resort}
          field={{
            name: "skiersPercent",
            label: "スキーヤー (%)",
            nullable: true,
          }}
        />
        <NumberField
          resort={resort}
          field={{
            name: "snowboardersPercent",
            label: "スノーボーダー (%)",
            nullable: true,
          }}
        />
      </FormSection>

      <FormSection title="コース概要">
        {COURSE_FIELDS.map(field => (
          <NumberField key={field.name} resort={resort} field={field} />
        ))}
        <LinesField
          name="courseImages"
          label="コース画像URL"
          values={resort.courseImages}
        />
      </FormSection>

      <FormSection title="リフト概要">
        {LIFT_FIELDS.map(field => (
          <NumberField key={field.name} resort={resort} field={field} />
        ))}
      </FormSection>

      <FormSection title="営業時間">
        <TextField
          name="weekdayOpen"
          label="平日 開始"
          value={resort.weekdayOpen}
        />
        <TextField
          name="weekdayClose"
          label="平日 終了"
          value={resort.weekdayClose}
        />
        <TextField
          name="weekendOpen"
          label="土日祝 開始"
          value={resort.weekendOpen}
        />
        <TextField
          name="weekendClose"
          label="土日祝 終了"
          value={resort.weekendClose}
        />
        <div className="space-y-1.5 md:col-span-2 lg:col-span-3">
          <Label htmlFor="timesComment">営業時間の補足</Label>
          <Textarea
            id="timesComment"
            name="timesComment"
            defaultValue={resort.timesComment ?? ""}
          />
        </div>
      </FormSection>

      <FormSection title="説明・参照元">
        <div className="space-y-1.5 md:col-span-2 lg:col-span-3">
          <Label htmlFor="descriptionShort">短い説明</Label>
          <Textarea
            id="descriptionShort"
            name="descriptionShort"
            defaultValue={resort.descriptionShort ?? ""}
          />
        </div>
        <div className="space-y-1.5 md:col-span-2 lg:col-span-3">
          <Label htmlFor="descriptionLong">詳しい説明</Label>
          <Textarea
            id="descriptionLong"
            name="descriptionLong"
            defaultValue={resort.descriptionLong ?? ""}
            className="min-h-40"
          />
        </div>
        <LinesField
          name="outlineImages"
          label="紹介画像URL"
          values={resort.outlineImages}
        />
        <LinesField
          name="sources"
          label="参照元URL・識別子"
          values={resort.sources}
        />
      </FormSection>

      {state.status === "error" && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
        >
          <div className="flex items-start gap-2 font-bold">
            <AlertTriangle
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <span>{state.message}</span>
          </div>
          {state.errors && state.errors.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-6 text-xs">
              {state.errors.map(error => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}
          {state.reason === "conflict" && (
            <Button
              type="button"
              variant="outline"
              className="mt-3"
              onClick={() => window.location.reload()}
            >
              <RefreshCw aria-hidden="true" />
              最新データを読み直す
            </Button>
          )}
        </div>
      )}

      <div className="sticky bottom-4 flex justify-end rounded-xl border border-gray-200 bg-white/95 p-3 shadow-lg backdrop-blur">
        <SaveButton />
      </div>
    </form>
  );
}

export function ResortAdminClient({
  initialResorts,
}: {
  initialResorts: AdminSkiResortRecord[];
}) {
  const [resorts, setResorts] = useState(initialResorts);
  const [selectedId, setSelectedId] = useState(initialResorts[0]?.id ?? "");
  const [filter, setFilter] = useState("");

  const selectedResort = resorts.find(resort => resort.id === selectedId);
  const visibleResorts = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase("ja");
    if (!query) return resorts;
    return resorts.filter(resort =>
      `${resort.nameJa} ${resort.nameEn} ${resort.shortName ?? ""} ${resort.id} ${resort.prefecture}`
        .toLocaleLowerCase("ja")
        .includes(query),
    );
  }, [filter, resorts]);
  const selectOptions = useMemo(() => {
    if (
      !selectedResort ||
      visibleResorts.some(resort => resort.id === selectedResort.id)
    ) {
      return visibleResorts;
    }
    return [selectedResort, ...visibleResorts];
  }, [selectedResort, visibleResorts]);

  const handleSaved = useCallback((saved: AdminSkiResortRecord) => {
    setResorts(current =>
      current.map(resort => (resort.id === saved.id ? saved : resort)),
    );
  }, []);

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <Card className="h-fit lg:sticky lg:top-6">
        <CardHeader>
          <CardTitle>スキー場を選択</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            type="search"
            value={filter}
            onChange={event => setFilter(event.target.value)}
            placeholder="名称・ID・都道府県で検索"
            aria-label="スキー場を検索"
          />
          <NativeSelect
            className="w-full"
            value={selectedId}
            onChange={event => setSelectedId(event.target.value)}
            aria-label="編集するスキー場"
          >
            {selectOptions.map(resort => (
              <NativeSelectOption key={resort.id} value={resort.id}>
                {resort.isActive ? "●" : "○"} {resort.nameJa}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <p className="text-xs text-gray-500">
            ● 公開中 / ○ 公開停止中（全 {resorts.length} 件）
          </p>
          {filter && visibleResorts.length === 0 && (
            <p className="text-sm text-amber-700">
              一致するスキー場がありません。
            </p>
          )}
          <p className="border-t border-gray-200 pt-3 text-xs leading-5 text-gray-500">
            別のスキー場を選ぶと、まだ保存していない入力は失われます。
          </p>
        </CardContent>
      </Card>

      {selectedResort ? (
        <ResortEditForm
          key={`${selectedResort.id}:${selectedResort.updatedAt}`}
          resort={selectedResort}
          onSaved={handleSaved}
        />
      ) : (
        <Card>
          <CardContent className="p-6 text-sm text-gray-600">
            編集するスキー場を選択してください。
          </CardContent>
        </Card>
      )}
    </div>
  );
}
