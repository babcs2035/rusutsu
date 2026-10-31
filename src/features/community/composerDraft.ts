import { z } from "zod";
import { reportEntrySchema } from "./contract";

// Drafts accept incomplete required fields, but never arbitrary persisted data.
export const composerDraftSchema = z.object({
  report: z.object({
    observedOn: z.string().max(10),
    observedTime: z.string().max(5).nullable(),
    entries: z.array(z.object(reportEntrySchema.shape)).max(1),
  }),
  version: z.number().int().positive().nullable(),
  removedPhotoIds: z.array(z.string().min(1).max(200)).max(6),
  idempotencyKey: z.string().uuid(),
  timeEdited: z.boolean(),
  locationEdited: z.boolean(),
  targetEdited: z.boolean(),
  pinOnly: z.boolean().default(false),
  liftSpeedText: z.string().max(10),
  kmhText: z.string().max(10),
  photosMissing: z.boolean().default(false),
});

export function currentTokyoDateTime(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    observedOn: `${values.year}-${values.month}-${values.day}`,
    observedTime: `${values.hour}:${values.minute}`,
  };
}

export function geolocationMessage(code: number) {
  if (code === 1)
    return "位置情報の利用が許可されていません。ブラウザの設定を確認するか、地図で場所を選んでください。";
  if (code === 3)
    return "現在位置の取得がタイムアウトしました。もう一度試すか、地図で場所を選んでください。";
  return "現在位置を取得できませんでした。電波状況を確認するか、地図で場所を選んでください。";
}
