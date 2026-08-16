"use client";

import { Fragment, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import { saveSlopeEdits } from "../actions";
import { COURSE_DETAIL_LABELS } from "../constants";
import type {
  EditorCourse,
  ResortOption,
  SlopeBeforeFeature,
  SlopeDetailEntry,
} from "../types";
import { courseToSavePayload } from "../utils/exportFiles";
import { validateCourses } from "../utils/validation";

type ConfirmStepProps = {
  resort: ResortOption;
  courses: EditorCourse[];
  fileHash: string | null;
  detailFileHash: string | null;
  preservedFeatures: SlopeBeforeFeature[];
  preservedDetails: SlopeDetailEntry[];
  onBack: () => void;
  onSaved: (writtenFiles: string[]) => void;
};

const displayValue = (value: string): string =>
  value.trim() === "" ? "（未入力）" : value;

export function ConfirmStep({
  resort,
  courses,
  fileHash,
  detailFileHash,
  preservedFeatures,
  preservedDetails,
  onBack,
  onSaved,
}: ConfirmStepProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const validation = useMemo(() => validateCourses(courses, true), [courses]);

  const handleSaveConfirm = async () => {
    if (validation.errors.length > 0 || isSaving) return;

    setIsSaving(true);
    setServerErrors([]);
    try {
      const result = await saveSlopeEdits({
        resortId: resort.id,
        fileHash,
        detailFileHash,
        courses: courses.map(course => courseToSavePayload(resort.id, course)),
        preservedFeatures,
        preservedDetails,
      });
      if (result.ok) {
        onSaved(result.writtenFiles);
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

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-gray-50">
      <div className="mx-auto flex w-[900px] max-w-full flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold font-[var(--font-heading)]">
              保存内容の確認
            </h2>
            <p className="text-sm text-gray-600">
              {resort.nameJa}（{resort.id}） / 全 {courses.length} コース
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={onBack}>
            分割・詳細編集へ戻る
          </Button>
        </div>

        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-1 font-[var(--font-heading)]">
              保存後のコース順（{courses.length} 件）
            </h3>
            <p className="text-xs text-gray-500 mb-3">
              この順番で slope_before の features に保存されます。
            </p>
            <div className="flex flex-col gap-3">
              {courses.map((course, index) => (
                <Fragment key={course.id}>
                  {index > 0 && <Separator className="border-gray-100" />}
                  <div className={index === 0 ? "" : "pt-3"}>
                    <p className="text-sm font-bold">
                      {index + 1}. {displayValue(course.name)}（
                      {course.coordinates.length} 点）
                    </p>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                      {(
                        Object.keys(COURSE_DETAIL_LABELS) as Array<
                          keyof typeof COURSE_DETAIL_LABELS
                        >
                      ).map(key => (
                        <span key={key} className="text-xs text-gray-700">
                          {COURSE_DETAIL_LABELS[key]}:{" "}
                          {displayValue(course.detail[key])}
                        </span>
                      ))}
                    </div>
                  </div>
                </Fragment>
              ))}
            </div>
          </CardContent>
        </Card>

        {preservedFeatures.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-1 font-[var(--font-heading)]">
                編集対象外の feature（{preservedFeatures.length} 件）
              </h3>
              <p className="text-xs text-gray-600">
                LineString 以外、または座標を編集できない feature
                は内容を変えずに slope_before の末尾へ保持します。
              </p>
            </CardContent>
          </Card>
        )}

        {preservedDetails.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-1 font-[var(--font-heading)]">
                コース線と未対応の slope_detail（{preservedDetails.length} 件）
              </h3>
              <p className="text-xs text-gray-600">
                コース線と名前が一致しない既存の詳細情報は読み込みません。
                slope_detail ファイル自体は変更しません。
              </p>
            </CardContent>
          </Card>
        )}

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
            description="編集結果で slope_before を書き換えます。よろしいですか？"
            onConfirm={handleSaveConfirm}
            confirmLabel="保存する"
          />
          <Button
            disabled={validation.errors.length > 0 || isSaving}
            onClick={() => setSaveDialogOpen(true)}
          >
            {isSaving ? "保存中…" : "保存（slope_before を書き換える）"}
          </Button>
          <Button variant="outline" onClick={onBack} disabled={isSaving}>
            戻る
          </Button>
        </div>
      </div>
    </div>
  );
}
