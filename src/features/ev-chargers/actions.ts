"use server";

import { requireEditor } from "@/lib/requireEditor";
import { readAdminSkiResorts } from "@/lib/skiResortData";
import {
  adminSkiResortUpdateRequestSchema,
  adminSkiResortUpdateSchema,
  skiResortIdSchema,
} from "@/server/ski-resorts/adminContract";
import { evChargersSchema } from "@/shared/utils/evChargers";
import { saveAdminResortRequest } from "../resort/saveAdminResort";

export type EvChargerSaveResult =
  | {
      status: "saved";
      message: string;
      updatedAt: string;
      evChargers: unknown;
      submitted: boolean;
    }
  | { status: "error"; message: string };

/**
 * 1スキー場の充電器だけを書き換える。ほかの列は今の値のまま送り、
 * スキー場編集と同じ保存の流れ（編集申請・データAPI・更新日時の競合検出）を通す。
 */
export async function saveResortEvChargers(
  rawId: unknown,
  expectedUpdatedAt: unknown,
  rawChargers: unknown,
): Promise<EvChargerSaveResult> {
  await requireEditor();
  const id = skiResortIdSchema.safeParse(rawId);
  const chargers = evChargersSchema.safeParse(rawChargers);
  if (!id.success || !chargers.success)
    return {
      status: "error",
      message: `入力内容を確認してください。${
        chargers.success
          ? ""
          : chargers.error.issues
              .slice(0, 3)
              .map(issue => `${issue.path.join(".")}: ${issue.message}`)
              .join(" / ")
      }`,
    };
  const current = (await readAdminSkiResorts()).find(
    resort => resort.id === id.data,
  );
  if (!current)
    return { status: "error", message: "このスキー場が見つかりません。" };
  const request = adminSkiResortUpdateRequestSchema.safeParse({
    expectedUpdatedAt,
    data: {
      ...Object.fromEntries(
        Object.keys(adminSkiResortUpdateSchema.shape).map(key => [
          key,
          current[key as keyof typeof current],
        ]),
      ),
      evChargers: chargers.data,
    },
  });
  if (!request.success)
    return {
      status: "error",
      message: "このスキー場の今のデータが保存できる形になっていません。",
    };
  const result = await saveAdminResortRequest(id.data, request.data);
  if (result.status === "saved")
    return {
      status: "saved",
      message: result.submission
        ? "変更を申請しました。承認後に反映されます。"
        : "保存しました。",
      updatedAt: result.resort.updatedAt,
      evChargers: result.resort.evChargers ?? chargers.data,
      submitted: Boolean(result.submission),
    };
  return {
    status: "error",
    message:
      result.status === "error" ? result.message : "保存できませんでした。",
  };
}
