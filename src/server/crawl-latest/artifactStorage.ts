import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { gunzip } from "node:zlib";

const gunzipAsync = promisify(gunzip);

export const MAX_ARTIFACT_REQUEST_BYTES = 12 * 1024 * 1024;
export const MAX_ARTIFACT_COMPRESSED_BYTES = 8 * 1024 * 1024;
export const MAX_ARTIFACT_HTML_BYTES = 32 * 1024 * 1024;

export class ArtifactStorageUnavailableError extends Error {
  constructor() {
    super("Crawler artifact storage is not configured");
    this.name = "ArtifactStorageUnavailableError";
  }
}

export class ArtifactContentConflictError extends Error {
  constructor() {
    super("Artifact key already contains different content");
    this.name = "ArtifactContentConflictError";
  }
}

export class ArtifactContentInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArtifactContentInvalidError";
  }
}

const artifactRoot = (): string => {
  const configured = process.env.CRAWLER_ARTIFACT_ROOT?.trim();
  if (!configured) throw new ArtifactStorageUnavailableError();
  return path.resolve(configured);
};

const sha256 = (value: Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");

const resolveStorageKey = (storageKey: string): string => {
  const root = artifactRoot();
  const resolved = path.resolve(root, storageKey);
  if (resolved === root || !resolved.startsWith(`${root}${path.sep}`)) {
    throw new ArtifactContentInvalidError("Invalid artifact storage key");
  }
  return resolved;
};

export type SaveRenderedDomArtifactInput = {
  producerId: string;
  idempotencyKey: string;
  resortId: string;
  manifestId: string;
  pageKey: string;
  compressedHtml: Uint8Array;
  expectedHtmlSha256: string;
};

export async function saveRenderedDomArtifact(
  input: SaveRenderedDomArtifactInput,
) {
  if (input.compressedHtml.byteLength > MAX_ARTIFACT_COMPRESSED_BYTES) {
    throw new ArtifactContentInvalidError("Compressed artifact is too large");
  }

  let html: Buffer;
  try {
    html = await gunzipAsync(input.compressedHtml, {
      maxOutputLength: MAX_ARTIFACT_HTML_BYTES,
    });
  } catch {
    throw new ArtifactContentInvalidError("Artifact is not valid gzip data");
  }
  if (html.byteLength > MAX_ARTIFACT_HTML_BYTES) {
    throw new ArtifactContentInvalidError("Rendered DOM is too large");
  }
  if (sha256(html) !== input.expectedHtmlSha256) {
    throw new ArtifactContentInvalidError("Rendered DOM hash does not match");
  }

  const storageKey = path.posix.join(
    "crawl_latest_dom",
    input.resortId,
    input.producerId,
    input.idempotencyKey,
    input.manifestId,
    `${input.pageKey}.gz`,
  );
  const target = resolveStorageKey(storageKey);
  await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });

  try {
    const existing = await fs.readFile(target);
    if (!(await verifyStoredRenderedDom(existing, input.expectedHtmlSha256))) {
      throw new ArtifactContentConflictError();
    }
    // A producer may retry an upload long before it can register the run. Make
    // that successful retry renew the orphan-GC grace period.
    const refreshedAt = new Date();
    await fs.utimes(target, refreshedAt, refreshedAt);
    return {
      created: false,
      storageKey,
      sha256: input.expectedHtmlSha256,
      sizeBytes: existing.byteLength,
      contentType: "text/html; charset=utf-8",
      contentEncoding: "gzip",
    };
  } catch (error) {
    if (
      !(error instanceof Error && "code" in error && error.code === "ENOENT")
    ) {
      throw error;
    }
  }

  const temporary = `${target}.tmp-${randomUUID()}`;
  try {
    await fs.writeFile(temporary, input.compressedHtml, { mode: 0o600 });
    // A hard link publishes the fully-written temporary file atomically and
    // fails with EEXIST when another identical idempotent upload won the race.
    // rename() would overwrite that winner and could desynchronise DB metadata.
    try {
      await fs.link(temporary, target);
    } catch (error) {
      if (
        !(error instanceof Error && "code" in error && error.code === "EEXIST")
      ) {
        throw error;
      }
      const existing = await fs.readFile(target);
      if (
        !(await verifyStoredRenderedDom(existing, input.expectedHtmlSha256))
      ) {
        throw new ArtifactContentConflictError();
      }
      const refreshedAt = new Date();
      await fs.utimes(target, refreshedAt, refreshedAt);
      return {
        created: false,
        storageKey,
        sha256: input.expectedHtmlSha256,
        sizeBytes: existing.byteLength,
        contentType: "text/html; charset=utf-8",
        contentEncoding: "gzip",
      };
    }
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
  }

  return {
    created: true,
    storageKey,
    sha256: input.expectedHtmlSha256,
    sizeBytes: input.compressedHtml.byteLength,
    contentType: "text/html; charset=utf-8",
    contentEncoding: "gzip",
  };
}

export async function readStoredArtifact(storageKey: string): Promise<Buffer> {
  return fs.readFile(resolveStorageKey(storageKey));
}

export async function verifyStoredRenderedDom(
  compressed: Uint8Array,
  expectedHtmlSha256: string,
): Promise<boolean> {
  if (compressed.byteLength > MAX_ARTIFACT_COMPRESSED_BYTES) return false;
  try {
    const html = await gunzipAsync(compressed, {
      maxOutputLength: MAX_ARTIFACT_HTML_BYTES,
    });
    return sha256(html) === expectedHtmlSha256;
  } catch {
    return false;
  }
}
