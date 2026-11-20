/** 配信中に展開済みの実バイト数を数え，限度を超える upstream を切断する． */

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
