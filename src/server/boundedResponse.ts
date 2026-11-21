// 内部 API の応答と中継中の本文に読み取り上限を適用する．

// 64 MiB の正本文書を含む応答には JSON エンコード分の余裕を取る．
const DEFAULT_INTERNAL_RESPONSE_LIMIT_BYTES = 128 * 1024 * 1024;
const DEFAULT_INTERNAL_RESPONSE_TIMEOUT_MS = 30_000;

type BoundedFetchOptions = {
  maxBytes?: number;
  timeoutMs?: number;
};

/** 内部 API の応答を期限・redirect・実 byte 上限付きで取得する． */
export async function fetchBoundedResponse(
  input: string | URL,
  init: RequestInit = {},
  options: BoundedFetchOptions = {},
): Promise<Response> {
  const maxBytes = options.maxBytes ?? DEFAULT_INTERNAL_RESPONSE_LIMIT_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_INTERNAL_RESPONSE_TIMEOUT_MS;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError("Response byte limit must be a non-negative integer");
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError("Response timeout must be a positive integer");
  }

  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeout])
    : timeout;
  const response = await fetch(input, {
    ...init,
    cache: "no-store",
    redirect: "error",
    signal,
  });
  if (!response.body) return response;
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    await response.body.cancel();
    throw new Error("Upstream body exceeds the byte limit");
  }

  return new Response(boundResponseBody(response.body, maxBytes), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

/** ヘッダーの Content-Length とは独立して上限を適用する． */
export function boundResponseBody(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
): ReadableStream<Uint8Array> {
  let bytes = 0;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        bytes += chunk.byteLength;
        if (bytes > maxBytes) {
          controller.error(new Error("Upstream body exceeds the byte limit"));
          return;
        }
        controller.enqueue(chunk);
      },
    }),
  );
}
