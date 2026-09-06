import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  DATA_DOCUMENT_MAX_CONTENT_LENGTH,
  dataDocumentKeySchema,
  dataDocumentWriteSchema,
} from "../src/server/data-documents/contract";
import { skiResortIdSchema } from "../src/server/ski-resorts/adminContract";

export const CANONICAL_SOURCES = [
  "SkiResortLinks.json",
  "lift-ticket",
  "reviews",
  "resorts-temporary/latest_status_mapping",
  "resorts-temporary/lift_20m",
  "resorts-temporary/lift_before",
  "resorts-temporary/lift_confirmed.json",
  "resorts-temporary/lift_detail",
  "resorts-temporary/slope_10m",
  "resorts-temporary/slope_10m_osm",
  "resorts-temporary/slope_before",
  "resorts-temporary/slope_before_osm",
  "resorts-temporary/slope_detail",
] as const;
export const DATA_ROOT = path.resolve(process.cwd(), "src/private/data");
export const hashContent = (content: string) =>
  createHash("sha256").update(content, "utf8").digest("hex");
export type ImportDocument = {
  key: string;
  content: string;
  mediaType: string;
  hash: string;
};

export async function readValidatedJsonFile(file: string): Promise<string> {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new Error(`Regular file required: ${file}`);
  if (stat.size > DATA_DOCUMENT_MAX_CONTENT_LENGTH)
    throw new Error(`Document is too large: ${file}`);
  const content = await fs.readFile(file, "utf8");
  if (Buffer.byteLength(content, "utf8") > DATA_DOCUMENT_MAX_CONTENT_LENGTH)
    throw new Error(`Document is too large: ${file}`);
  return content;
}

export async function collectImportDocuments(
  root = DATA_ROOT,
  sources: readonly string[] = CANONICAL_SOURCES,
) {
  const documents: ImportDocument[] = [];
  const seen = new Set<string>();
  const visit = async (target: string): Promise<void> => {
    const relative = path.relative(root, target);
    const key = dataDocumentKeySchema.parse(relative.split(path.sep).join("/"));
    const stat = await fs.lstat(target);
    if (stat.isSymbolicLink())
      throw new Error(`Symlinks are not migration sources: ${key}`);
    if (stat.isDirectory()) {
      for (const entry of (await fs.readdir(target)).sort())
        await visit(path.join(target, entry));
      return;
    }
    if (!stat.isFile() || !/\.(?:geo)?json$/u.test(key)) return;
    if (seen.has(key)) throw new Error(`Duplicate document key: ${key}`);
    const content = await readValidatedJsonFile(target);
    const mediaType = key.endsWith(".geojson")
      ? "application/geo+json"
      : "application/json";
    const parsed = dataDocumentWriteSchema.safeParse({
      key,
      content,
      mediaType,
      expectedHash: null,
    });
    if (!parsed.success)
      throw new Error(
        `Invalid migration source ${key}: ${parsed.error.message}`,
      );
    seen.add(key);
    documents.push({ key, content, mediaType, hash: hashContent(content) });
  };
  for (const source of sources) {
    dataDocumentKeySchema.parse(source);
    let current = root;
    for (const segment of source.split("/")) {
      current = path.join(current, segment);
      if ((await fs.lstat(current)).isSymbolicLink())
        throw new Error(`Symlinks are not migration sources: ${source}`);
    }
    await visit(path.resolve(root, source));
  }
  if (documents.length === 0)
    throw new Error(
      "No canonical documents found; refusing to mark migration complete",
    );
  return documents.sort((a, b) => a.key.localeCompare(b.key));
}

export const shortNameSourceSchema = z
  .strictObject({
    resorts: z
      .array(
        z.strictObject({
          id: skiResortIdSchema,
          shortName: z.string().trim().min(1).max(100),
        }),
      )
      .min(1)
      .max(10_000),
  })
  .superRefine((source, context) => {
    if (
      new Set(source.resorts.map(resort => resort.id)).size !==
      source.resorts.length
    )
      context.addIssue({ code: "custom", message: "Duplicate ski resort ids" });
  });
