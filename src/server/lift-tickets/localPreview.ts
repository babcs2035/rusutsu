import "server-only";

import fs from "node:fs";
import path from "node:path";
import { type LiftTicketSeason, statusOfLiftTicket } from "./contract";

/**
 * 開発時だけ、公開画面のリフト券データを手元のJSONで差し替える。
 * 本番DBへ反映する前の草案（レンタル料金など）を、実際の画面で確かめるため。
 *
 * `LIFT_TICKET_PREVIEW_ROOT` に `{resort-id}/{season-id}.json` を置いたディレクトリを
 * 指定する。同じスキー場・シーズンがあれば差し替え、無ければ追加する。
 * 本番（NODE_ENV=production）では常に無効。管理画面の読み書きには使わない。
 */
const previewRoot = () =>
  process.env.NODE_ENV === "development"
    ? (process.env.LIFT_TICKET_PREVIEW_ROOT ?? null)
    : null;

const readPreviewSeasons = (root: string, resortId: string) => {
  const dir = path.join(root, resortId);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(file => /^\d{4}-\d{4}\.json$/u.test(file))
    .map((file): LiftTicketSeason => {
      const data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
      return {
        resortId,
        seasonId: file.replace(/\.json$/u, ""),
        status: statusOfLiftTicket(data),
        version: 0,
        updatedAt: fs.statSync(path.join(dir, file)).mtime.toISOString(),
        data,
      };
    });
};

export const withLocalPreview = (
  seasons: LiftTicketSeason[],
  resortIds: readonly string[],
): LiftTicketSeason[] => {
  const root = previewRoot();
  if (!root) return seasons;
  const previews = resortIds.flatMap(resortId =>
    readPreviewSeasons(root, resortId),
  );
  if (previews.length === 0) return seasons;
  const keyOf = (season: LiftTicketSeason) =>
    `${season.resortId}/${season.seasonId}`;
  const replaced = new Set(previews.map(keyOf));
  return [
    ...seasons.filter(season => !replaced.has(keyOf(season))),
    ...previews,
  ];
};
