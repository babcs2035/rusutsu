"use client";

import { useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ValidationResult } from "@/features/slope/types";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import { saveLiftEdits, saveResortLinks } from "../actions";
import { RESORT_LINK_KEYS, RESORT_LINK_LABELS } from "../constants";
import type { EditorLift, ResortLinks, ResortOption } from "../types";
import { collectLiftChanges, hasAnyChange } from "../utils/diff";
import { liftDisplayName } from "../utils/liftOps";
import { validateResortLinks } from "../utils/linkValidation";
import { liftToSavePayload } from "../utils/savePayload";
import { validateLifts } from "../utils/validation";
import { LinkListField } from "./LinksStep";

type ConfirmStepProps = {
  resort: ResortOption;
  resorts: ResortOption[];
  lifts: EditorLift[];
  deletedLifts: EditorLift[];
  links: ResortLinks;
  setLinks: (links: ResortLinks) => void;
  fileHash: string | null;
  onBack: () => void;
  // 保存成功後に呼ばれる（下書き破棄・選択画面へ戻る）
  onSaved: (writtenFiles: string[]) => void;
  // 確認済みフラグの切り替え（lift_confirmed.json を更新する）
  onToggleConfirmed: (
    resort: ResortOption,
    confirmed: boolean,
  ) => Promise<void>;
};

const formatDateTime = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString("ja-JP");
};

const ChangeValue = ({ before, after }: { before: string; after: string }) => (
  <span>
    <span className="text-gray-500 line-through">
      {before === "" ? "（空欄）" : before}
    </span>
    {" → "}
    <span className="font-bold">{after === "" ? "（空欄）" : after}</span>
  </span>
);

export function ConfirmStep({
  resort,
  resorts,
  lifts,
  deletedLifts,
  links,
  setLinks,
  fileHash,
  onBack,
  onSaved,
  onToggleConfirmed,
}: ConfirmStepProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [isTogglingConfirmed, setIsTogglingConfirmed] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);

  const handleToggleConfirmed = async () => {
    setIsTogglingConfirmed(true);
    try {
      await onToggleConfirmed(resort, resort.confirmedAt === null);
    } finally {
      setIsTogglingConfirmed(false);
    }
  };

  const resortById = useMemo(
    () => new Map(resorts.map(option => [option.id, option])),
    [resorts],
  );

  const validation: ValidationResult = useMemo(() => {
    const liftValidation = validateLifts(
      lifts,
      new Set(resorts.map(option => option.id)),
    );
    return {
      errors: liftValidation.errors,
      warnings: [
        ...liftValidation.warnings,
        ...validateResortLinks(resort.id, links, lifts),
      ],
    };
  }, [lifts, links, resort.id, resorts]);

  const allChanges = useMemo(
    () => lifts.map(collectLiftChanges).filter(hasAnyChange),
    [lifts],
  );

  const resortLabel = (skiId: string): string => {
    const nameJa = resortById.get(skiId)?.nameJa;
    return nameJa ? `${skiId}（${nameJa}）` : skiId;
  };

  const handleSaveConfirm = async () => {
    if (validation.errors.length > 0 || isSaving) return;
    setIsSaving(true);
    setServerErrors([]);
    try {
      // 手順6でリンクを追加・修正した場合も、リフトと同じ保存操作で反映する。
      await saveResortLinks(resort.id, links);
      const result = await saveLiftEdits({
        resortId: resort.id,
        fileHash,
        lifts: lifts.map(liftToSavePayload),
      });
      if (result.ok) {
        onSaved([...result.writtenFiles, "SkiResortLinks.json"]);
      } else {
        setServerErrors(result.errors);
      }
    } catch (error) {
      setServerErrors([
        `保存に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
      ]);
    } finally {
      setIsSaving(false);
    }
  };

  const skiIdChanges = allChanges.filter(change => change.skiIdChange);
  const geometryChanges = allChanges.filter(change => change.geometryChange);
  const fieldChanges = allChanges.filter(
    change => change.fieldChanges.length > 0,
  );
  const mergedChanges = allChanges.filter(
    change => change.mergedFields.length > 0,
  );

  return (
    <div className="flex h-full min-h-0 justify-center overflow-y-auto bg-gray-50">
      <div className="flex w-full max-w-[820px] flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold font-[var(--font-heading)]">
              変更内容の確認
            </h2>
            <p className="text-sm text-gray-600">
              {resort.nameJa ? `${resort.nameJa}（${resort.id}）` : resort.id} /
              全 {lifts.length} リフト
            </p>
            {resort.confirmedAt && (
              <p className="text-xs text-green-900">
                ✓ 確認済み（{formatDateTime(resort.confirmedAt)}）
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={isTogglingConfirmed}
              onClick={handleToggleConfirmed}
              className={
                resort.confirmedAt
                  ? "border-orange-300 text-orange-900 hover:bg-orange-50 hover:text-orange-700"
                  : "border-green-300 text-green-900 hover:bg-green-50"
              }
            >
              {resort.confirmedAt ? "確認済みを解除" : "✓ 確認済みにする"}
            </Button>
            <Button size="sm" variant="outline" onClick={onBack}>
              全体情報リンクへ戻る
            </Button>
          </div>
        </div>

        {allChanges.length === 0 && deletedLifts.length === 0 && (
          <Card>
            <CardContent>
              <p className="text-sm text-gray-600">
                リフトの変更はありません。このまま保存すると、lift_detail
                から自動結合された情報も含めて現在の内容で lift_before
                を書き換えます。
              </p>
            </CardContent>
          </Card>
        )}

        {deletedLifts.length > 0 && (
          <Alert variant="destructive" className="border-red-300 bg-red-50">
            <AlertTitle className="text-sm text-red-700">
              削除するリフト（{deletedLifts.length} 件）
            </AlertTitle>
            <AlertDescription className="text-xs text-red-700">
              <p className="mb-2">保存すると lift_before から削除されます。</p>
              {deletedLifts.map(lift => (
                <p key={lift.id} className="text-sm">
                  ・{liftDisplayName(lift)}
                </p>
              ))}
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">
              保存後のリフト順（{lifts.length} 件）
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-2 text-xs text-gray-500">
              この順番で GeoJSON の features に保存されます。
            </p>
            {lifts.map((lift, index) => (
              <p key={lift.id} className="text-sm">
                {index + 1}. {liftDisplayName(lift, index)}
              </p>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">
              スキー場全体のリンク
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-xs text-gray-500">
              手順5で追加した内容を確認できます。この画面でも追加・修正できます。
            </p>
            <div className="flex flex-col gap-4">
              {RESORT_LINK_KEYS.map(key => (
                <LinkListField
                  key={key}
                  label={RESORT_LINK_LABELS[key]}
                  values={links[key] ?? []}
                  onChange={values => setLinks({ ...links, [key]: values })}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">
              スキー場IDの変更（{skiIdChanges.length} 件）
            </CardTitle>
          </CardHeader>
          <CardContent>
            {skiIdChanges.length === 0 ? (
              <p className="text-sm font-semibold text-gray-500">なし</p>
            ) : (
              skiIdChanges.map(change => (
                <p key={change.lift.id} className="mb-1 text-sm">
                  ・{liftDisplayName(change.lift)}:{" "}
                  {change.skiIdChange && (
                    <ChangeValue
                      before={resortLabel(change.skiIdChange.before)}
                      after={resortLabel(change.skiIdChange.after)}
                    />
                  )}
                  （保存時に移動先の lift_before へ追記されます）
                </p>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">
              位置情報の変更（{geometryChanges.length} 件）
            </CardTitle>
          </CardHeader>
          <CardContent>
            {geometryChanges.length === 0 ? (
              <p className="text-sm font-semibold text-gray-500">なし</p>
            ) : (
              geometryChanges.map(change => (
                <p key={change.lift.id} className="mb-1 text-sm">
                  ・{liftDisplayName(change.lift)}: {change.geometryChange}
                </p>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">
              詳細情報の追加・変更（{fieldChanges.length} 件）
            </CardTitle>
          </CardHeader>
          <CardContent>
            {fieldChanges.length === 0 ? (
              <p className="text-sm font-semibold text-gray-500">なし</p>
            ) : (
              fieldChanges.map(change => (
                <div key={change.lift.id} className="mb-2">
                  <p className="text-sm font-bold">
                    ・{liftDisplayName(change.lift)}
                  </p>
                  {change.fieldChanges.map(field => (
                    <p key={field.key} className="pl-4 text-sm">
                      {field.label}:{" "}
                      <ChangeValue before={field.before} after={field.after} />
                    </p>
                  ))}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">
              lift_detail から結合された情報（{mergedChanges.length} 件）
            </CardTitle>
          </CardHeader>
          <CardContent>
            {mergedChanges.length === 0 ? (
              <p className="text-sm font-semibold text-gray-500">なし</p>
            ) : (
              mergedChanges.map(change => (
                <div key={change.lift.id} className="mb-2">
                  <p className="text-sm font-bold">
                    ・{liftDisplayName(change.lift)} ← lift_detail「
                    {change.lift.detailMatch?.detailName}」（
                    {change.lift.detailMatch?.method === "name"
                      ? "名前一致で自動結合"
                      : "手動で結合"}
                    ）
                  </p>
                  {change.mergedFields.map(field => (
                    <p key={field.key} className="pl-4 text-sm">
                      {field.label}:{" "}
                      {field.after === "" ? "（空欄）" : field.after}
                      {field.before !== "" && field.before !== field.after && (
                        <span className="text-gray-500">
                          （元の値: {field.before}）
                        </span>
                      )}
                    </p>
                  ))}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {validation.errors.length > 0 && (
          <Alert variant="destructive" className="border-red-300 bg-red-50">
            <AlertTitle className="text-sm text-red-700">
              エラーがあるため保存できません
            </AlertTitle>
            <AlertDescription className="text-xs text-red-700">
              {validation.errors.map(error => (
                <p key={error}>・{error}</p>
              ))}
            </AlertDescription>
          </Alert>
        )}
        {validation.warnings.length > 0 && (
          <Alert className="border-orange-300 bg-orange-50">
            <AlertTitle className="text-sm text-orange-900">警告</AlertTitle>
            <AlertDescription className="text-xs text-orange-900">
              {validation.warnings.map(warning => (
                <p key={warning}>・{warning}</p>
              ))}
            </AlertDescription>
          </Alert>
        )}
        {serverErrors.length > 0 && (
          <Alert variant="destructive" className="border-red-300 bg-red-50">
            <AlertTitle className="text-sm text-red-700">
              保存時にエラーが発生しました
            </AlertTitle>
            <AlertDescription className="text-xs text-red-700">
              {serverErrors.map(error => (
                <p key={error}>・{error}</p>
              ))}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex gap-3 pb-6">
          <ConfirmDialog
            open={saveDialogOpen}
            onOpenChange={setSaveDialogOpen}
            title="保存確認"
            description={
              deletedLifts.length > 0
                ? `編集結果で lift_before とスキー場全体リンクを書き換え、${deletedLifts.length} 件のリフトを削除します。よろしいですか？`
                : "編集結果で lift_before とスキー場全体リンクを書き換えます。よろしいですか？"
            }
            onConfirm={handleSaveConfirm}
            confirmLabel="保存する"
          />
          <Button
            variant="default"
            disabled={validation.errors.length > 0 || isSaving}
            onClick={() => setSaveDialogOpen(true)}
          >
            {isSaving ? "保存中…" : "保存（リフト・リンクを書き換える）"}
          </Button>
          <Button variant="outline" onClick={onBack} disabled={isSaving}>
            戻る
          </Button>
        </div>
      </div>
    </div>
  );
}
