// スキー場ごとの公開URL（/rusutsu/{resortId}）と ID の相互変換。
// ルートの静的ページ（admin, login 等）と同名の ID は無いが、念のため除外する。
const BASE_PATH = "/rusutsu";
export const SITE_TITLE =
  "Rusutsu | 全国のスキー場情報・積雪予報・コース詳細を一元化";
const RESERVED_SEGMENTS = new Set([
  "admin",
  "api",
  "login",
  "offline-tab",
  "_next",
]);
const RESORT_ID_PATTERN = /^[a-z0-9-]{1,200}$/;

export const isResortIdSegment = (value: string) =>
  RESORT_ID_PATTERN.test(value) && !RESERVED_SEGMENTS.has(value);

/** basePath 付きの pathname からスキー場 ID を取り出す。ホームなら null。 */
export function resortIdFromPathname(pathname: string): string | null {
  const match = /^\/rusutsu\/([^/]+)\/?$/.exec(pathname);
  return match && isResortIdSegment(match[1]) ? match[1] : null;
}

/** ホームまたはスキー場ページ（公開地図）の pathname か。 */
export const isPublicMapPathname = (pathname: string) =>
  pathname === BASE_PATH ||
  pathname === `${BASE_PATH}/` ||
  resortIdFromPathname(pathname) !== null;

/** 旧形式の ?resort= も受け付ける。 */
export const resortIdFromUrl = (url: URL) =>
  resortIdFromPathname(url.pathname) ?? url.searchParams.get("resort");

export const resortPathname = (resortId: string | null) =>
  resortId ? `${BASE_PATH}/${resortId}` : BASE_PATH;

/** layout の title.template と同じ形。履歴操作では metadata が更新されない。 */
export const resortDocumentTitle = (resortName: string | null) =>
  resortName ? `${resortName} | Rusutsu` : SITE_TITLE;
