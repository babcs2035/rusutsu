// 写真の成功応答と秘匿 404 を同じ cache・content policy に揃える．
export const privatePhotoResponseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
} as const;

/** 写真がない場合と閲覧できない場合を同じ非保存応答で返す． */
export function privatePhotoNotFoundResponse(): Response {
  return new Response(null, {
    status: 404,
    headers: privatePhotoResponseHeaders,
  });
}
