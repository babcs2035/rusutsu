/** Enforce the limit while streaming, including requests without Content-Length. */
export class RequestBodyError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RequestBodyError";
  }
}

export async function readRequestText(
  request: Request,
  maxBytes: number,
  timeoutMs = 30_000,
): Promise<string> {
  const tooLarge = () =>
    new RequestBodyError(413, "PAYLOAD_TOO_LARGE", "Request body is too large");
  const length = request.headers.get("content-length");
  if (length !== null) {
    if (!/^\d+$/u.test(length)) {
      throw new RequestBodyError(400, "INVALID_BODY", "Invalid Content-Length");
    }
    if (Number(length) > maxBytes) throw tooLarge();
  }
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(
      () =>
        reject(
          new RequestBodyError(
            408,
            "REQUEST_TIMEOUT",
            "Request body timed out",
          ),
        ),
      timeoutMs,
    );
  });
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw tooLarge();
      chunks.push(value);
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(chunks, size),
    );
  } catch (error) {
    void reader.cancel().catch(() => {});
    if (error instanceof RequestBodyError) throw error;
    throw new RequestBodyError(
      400,
      "INVALID_BODY",
      "Unable to read request body",
    );
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
}

export async function readRequestJson(
  request: Request,
  maxBytes: number,
): Promise<unknown> {
  if (
    request.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase() !== "application/json"
  ) {
    throw new RequestBodyError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Content-Type must be application/json",
    );
  }
  const text = await readRequestText(request, maxBytes);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new RequestBodyError(
      400,
      "INVALID_JSON",
      "Request body is not valid JSON",
    );
  }
}
