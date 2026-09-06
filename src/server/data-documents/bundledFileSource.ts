import { promises as fs } from "node:fs";
import path from "node:path";
import {
  DATA_DOCUMENT_MAX_CONTENT_LENGTH,
  type DataDocument,
  type DataDocumentSummary,
  dataDocumentKeySchema,
  dataDocumentPrefixSchema,
  dataDocumentSchema,
  isSafeDataDocumentKey,
} from "./contract";
import {
  type BundledDataDocumentSource,
  hashDataDocumentContent,
} from "./repositoryCore";

const BUNDLED_EXTENSIONS = new Set([".geojson", ".json"]);
const FILE_READ_CONCURRENCY = 16;

const mediaTypeForKey = (key: string): string =>
  path.posix.extname(key).toLowerCase() === ".geojson"
    ? "application/geo+json"
    : "application/json";

const isMissingPathError = (error: unknown): boolean =>
  error instanceof Error &&
  "code" in error &&
  (error.code === "ENOENT" || error.code === "ENOTDIR");

const isInsideRoot = (root: string, candidate: string): boolean => {
  const relative = path.relative(root, candidate);
  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
};

const asSummary = (document: DataDocument): DataDocumentSummary => {
  const { content: _content, ...summary } = document;
  return summary;
};

/**
 * リポジトリに同梱された src/private/data の JSON/GeoJSON を読み取り専用の
 * 初期値として提供する。シンボリックリンクは辿らない。
 */
export class BundledFileDataDocumentSource
  implements BundledDataDocumentSource
{
  constructor(private readonly root: string) {}

  async get(untrustedKey: string): Promise<DataDocument | null> {
    const key = dataDocumentKeySchema.parse(untrustedKey);
    if (!BUNDLED_EXTENSIONS.has(path.posix.extname(key).toLowerCase())) {
      return null;
    }

    let realRoot: string;
    try {
      realRoot = await fs.realpath(this.root);
      const candidate = path.resolve(realRoot, ...key.split("/"));
      if (!isInsideRoot(realRoot, candidate)) return null;

      let currentPath = realRoot;
      for (const segment of key.split("/")) {
        currentPath = path.join(currentPath, segment);
        const segmentStat = await fs.lstat(currentPath);
        if (segmentStat.isSymbolicLink()) return null;
      }
    } catch (error) {
      if (isMissingPathError(error)) return null;
      throw error;
    }

    const file = path.resolve(realRoot, ...key.split("/"));
    const stat = await fs.lstat(file);
    if (!stat.isFile()) return null;
    if (stat.size > DATA_DOCUMENT_MAX_CONTENT_LENGTH) {
      throw new Error(`Bundled document exceeds byte limit: ${key}`);
    }
    const content = await fs.readFile(file, "utf8");
    return dataDocumentSchema.parse({
      key,
      content,
      mediaType: mediaTypeForKey(key),
      hash: hashDataDocumentContent(content),
      version: 0,
      source: "bundled",
    });
  }

  async list(untrustedPrefix = ""): Promise<DataDocumentSummary[]> {
    const prefix = dataDocumentPrefixSchema.parse(untrustedPrefix);
    let realRoot: string;
    try {
      realRoot = await fs.realpath(this.root);
    } catch (error) {
      if (isMissingPathError(error)) return [];
      throw error;
    }

    const keys: string[] = [];
    await this.collectKeys(realRoot, "", prefix, keys);
    const documents: Array<DataDocument | null> = new Array(keys.length).fill(
      null,
    );
    let nextIndex = 0;
    const readNext = async () => {
      while (nextIndex < keys.length) {
        const index = nextIndex;
        nextIndex += 1;
        const key = keys[index];
        if (key) documents[index] = await this.get(key);
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(FILE_READ_CONCURRENCY, keys.length) },
        readNext,
      ),
    );
    return documents
      .filter((document): document is DataDocument => document !== null)
      .map(asSummary);
  }

  private async collectKeys(
    directory: string,
    relativeDirectory: string,
    prefix: string,
    output: string[],
  ): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await this.collectKeys(absolutePath, relativePath, prefix, output);
        continue;
      }
      if (
        entry.isFile() &&
        relativePath.startsWith(prefix) &&
        isSafeDataDocumentKey(relativePath) &&
        BUNDLED_EXTENSIONS.has(path.posix.extname(relativePath).toLowerCase())
      ) {
        output.push(relativePath);
      }
    }
  }
}

export const defaultBundledDataDocumentRoot = (): string =>
  path.resolve(process.cwd(), "src/private/data");
