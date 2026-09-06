"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/requireAdmin";
import { updateAdminSkiResort } from "@/lib/skiResortData";
import {
  type AdminSkiResortRecord,
  adminSkiResortUpdateRequestSchema,
  skiResortIdSchema,
} from "@/server/ski-resorts/adminContract";

export type ResortAdminActionState =
  | { status: "idle" }
  | { status: "saved"; message: string; resort: AdminSkiResortRecord }
  | {
      status: "error";
      reason: "validation" | "conflict" | "not_found" | "unexpected";
      message: string;
      errors?: string[];
    };

const textValue = (formData: FormData, name: string): unknown => {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
};

const numberValue = (
  formData: FormData,
  name: string,
  nullable = false,
): unknown => {
  const value = textValue(formData, name);
  if (typeof value !== "string" || value.trim() === "") {
    return nullable ? null : undefined;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : value;
};

const nullableTextValue = (formData: FormData, name: string): unknown => {
  const value = textValue(formData, name);
  return typeof value === "string" && value.trim() !== "" ? value : null;
};

const lineListValue = (formData: FormData, name: string): unknown => {
  const value = textValue(formData, name);
  return typeof value === "string" ? value.split(/\r?\n/u) : undefined;
};

const formatValidationIssues = (
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>,
) =>
  issues.slice(0, 12).map(issue => {
    const field = issue.path.join(".") || "入力内容";
    return `${field}: ${issue.message}`;
  });

export async function updateSkiResortFromAdmin(
  _previousState: ResortAdminActionState,
  formData: FormData,
): Promise<ResortAdminActionState> {
  await requireAdmin();

  const id = skiResortIdSchema.safeParse(textValue(formData, "id"));
  const request = adminSkiResortUpdateRequestSchema.safeParse({
    expectedUpdatedAt: textValue(formData, "expectedUpdatedAt"),
    data: {
      nameJa: textValue(formData, "nameJa"),
      nameEn: textValue(formData, "nameEn"),
      shortName: nullableTextValue(formData, "shortName"),
      isActive: formData.get("isActive") === "on",
      prefecture: textValue(formData, "prefecture"),
      town: textValue(formData, "town"),
      latitude: numberValue(formData, "latitude"),
      longitude: numberValue(formData, "longitude"),
      topElevation: numberValue(formData, "topElevation"),
      baseElevation: numberValue(formData, "baseElevation"),
      verticalDrop: numberValue(formData, "verticalDrop"),
      numberOfCourses: numberValue(formData, "numberOfCourses"),
      longestCourse: numberValue(formData, "longestCourse"),
      steepestSlope: numberValue(formData, "steepestSlope", true),
      beginnersCoursesPercent: numberValue(formData, "beginnersCoursesPercent"),
      intermediateCoursesPercent: numberValue(
        formData,
        "intermediateCoursesPercent",
      ),
      advancedCoursesPercent: numberValue(formData, "advancedCoursesPercent"),
      courseImages: lineListValue(formData, "courseImages"),
      typeNotPressed: numberValue(formData, "typeNotPressed", true),
      typePressed: numberValue(formData, "typePressed", true),
      typeBump: numberValue(formData, "typeBump", true),
      angleMax: numberValue(formData, "angleMax", true),
      angleAvg: numberValue(formData, "angleAvg", true),
      numberOfLifts: numberValue(formData, "numberOfLifts"),
      ropeways: numberValue(formData, "ropeways"),
      gondolas: numberValue(formData, "gondolas"),
      quadLifts: numberValue(formData, "quadLifts"),
      tripleLifts: numberValue(formData, "tripleLifts"),
      pairLifts: numberValue(formData, "pairLifts"),
      singleLifts: numberValue(formData, "singleLifts"),
      otherLifts: numberValue(formData, "otherLifts"),
      liftCapacity: numberValue(formData, "liftCapacity", true),
      weekdayOpen: nullableTextValue(formData, "weekdayOpen"),
      weekdayClose: nullableTextValue(formData, "weekdayClose"),
      weekendOpen: nullableTextValue(formData, "weekendOpen"),
      weekendClose: nullableTextValue(formData, "weekendClose"),
      timesComment: nullableTextValue(formData, "timesComment"),
      website: nullableTextValue(formData, "website"),
      skiersPercent: numberValue(formData, "skiersPercent", true),
      snowboardersPercent: numberValue(formData, "snowboardersPercent", true),
      sources: lineListValue(formData, "sources"),
      descriptionShort: nullableTextValue(formData, "descriptionShort"),
      descriptionLong: nullableTextValue(formData, "descriptionLong"),
      outlineImages: lineListValue(formData, "outlineImages"),
      condition: nullableTextValue(formData, "condition"),
      status: nullableTextValue(formData, "status"),
      review: numberValue(formData, "review", true),
    },
  });

  if (!id.success || !request.success) {
    const issues = [
      ...(id.success ? [] : id.error.issues),
      ...(request.success ? [] : request.error.issues),
    ];
    return {
      status: "error",
      reason: "validation",
      message:
        "入力内容を保存できませんでした。表示された項目を確認してください。",
      errors: formatValidationIssues(issues),
    };
  }

  try {
    const result = await updateAdminSkiResort(id.data, request.data);
    if (result.status === "conflict") {
      return {
        status: "error",
        reason: "conflict",
        message:
          "別の管理者が先にこのスキー場を更新しました。ページを再読み込みし、最新の内容を確認してから編集し直してください。",
      };
    }
    if (result.status === "not_found") {
      return {
        status: "error",
        reason: "not_found",
        message: "このスキー場はデータベースに存在しません。",
      };
    }

    revalidatePath("/");
    revalidatePath("/admin/resort");
    return {
      status: "saved",
      message: "スキー場情報を保存しました。",
      resort: result.resort,
    };
  } catch (error) {
    console.error("Failed to update ski resort from admin", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return {
      status: "error",
      reason: "unexpected",
      message:
        "サーバーとの通信または保存に失敗しました。時間を置いてもう一度お試しください。",
    };
  }
}
