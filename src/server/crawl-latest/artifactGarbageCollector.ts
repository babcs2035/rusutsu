import { type Dirent, promises as fs } from "node:fs";
import path from "node:path";

export const CRAWL_LATEST_ORPHAN_ARTIFACT_TTL_MS = 24 * 60 * 60 * 1_000;
export const CRAWL_LATEST_ARTIFACT_GC_INTERVAL_MS = 60 * 60 * 1_000;

const DATABASE_LOOKUP_BATCH_SIZE = 500;
const ARTIFACT_DIRECTORY = "crawl_latest_dom";
const ARTIFACT_GC_LOCK_NAMESPACE = 0x4352_4743;
const ARTIFACT_GC_LOCK_KEY = 1;

type ReferencedStorageKeyLookup = (
  storageKeys: readonly string[],
) => Promise<ReadonlySet<string>>;

type ExclusiveRunner = <T>(
  task: () => Promise<T>,
) => Promise<{ acquired: true; value: T } | { acquired: false }>;

type ArtifactCandidate = {
  absolutePath: string;
  storageKey: string;
  device: number;
  inode: number;
};

export type ArtifactGarbageCollectionResult =
  | {
      status: "completed";
      scannedFileCount: number;
      candidateCount: number;
      referencedCount: number;
      deletedCount: number;
    }
  | {
      status: "skipped";
      reason: "interval" | "lock-unavailable";
    };

export type ArtifactGarbageCollectorOptions = {
  artifactRoot: () => string;
  findReferencedStorageKeys: ReferencedStorageKeyLookup;
  runExclusive?: ExclusiveRunner;
  now?: () => number;
  minimumAgeMs?: number;
  minimumIntervalMs?: number;
};

const isMissing = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

const isWithin = (parent: string, child: string): boolean =>
  child.startsWith(`${parent}${path.sep}`);

async function listOldGzipCandidates(
  artifactRoot: string,
  cutoffMs: number,
): Promise<{ candidates: ArtifactCandidate[]; scannedFileCount: number }> {
  const scanRoot = path.resolve(artifactRoot, ARTIFACT_DIRECTORY);
  if (!isWithin(path.resolve(artifactRoot), scanRoot)) {
    throw new Error("Crawler artifact GC root is invalid");
  }

  try {
    const rootStat = await fs.lstat(scanRoot);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
      return { candidates: [], scannedFileCount: 0 };
    }
  } catch (error) {
    if (isMissing(error)) return { candidates: [], scannedFileCount: 0 };
    throw error;
  }

  const candidates: ArtifactCandidate[] = [];
  let scannedFileCount = 0;
  const pendingDirectories = [scanRoot];

  while (pendingDirectories.length > 0) {
    const directory = pendingDirectories.pop();
    if (!directory) break;

    let entries: Dirent<string>[];
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (isMissing(error)) continue;
      throw error;
    }

    for (const entry of entries) {
      const absolutePath = path.resolve(directory, entry.name);
      if (!isWithin(scanRoot, absolutePath)) continue;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        pendingDirectories.push(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;

      scannedFileCount += 1;
      if (!entry.name.endsWith(".gz")) continue;

      let stat: Awaited<ReturnType<typeof fs.lstat>>;
      try {
        stat = await fs.lstat(absolutePath);
      } catch (error) {
        if (isMissing(error)) continue;
        throw error;
      }
      if (!stat.isFile() || stat.isSymbolicLink() || stat.mtimeMs > cutoffMs) {
        continue;
      }

      const relativePath = path.relative(
        path.resolve(artifactRoot),
        absolutePath,
      );
      if (
        relativePath === "" ||
        relativePath === ".." ||
        relativePath.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relativePath)
      ) {
        continue;
      }
      candidates.push({
        absolutePath,
        storageKey: relativePath.split(path.sep).join("/"),
        device: stat.dev,
        inode: stat.ino,
      });
    }
  }

  return { candidates, scannedFileCount };
}

async function findReferencesInBatches(
  candidates: readonly ArtifactCandidate[],
  findReferencedStorageKeys: ReferencedStorageKeyLookup,
): Promise<Set<string>> {
  const referenced = new Set<string>();
  for (
    let index = 0;
    index < candidates.length;
    index += DATABASE_LOOKUP_BATCH_SIZE
  ) {
    const keys = candidates
      .slice(index, index + DATABASE_LOOKUP_BATCH_SIZE)
      .map(candidate => candidate.storageKey);
    for (const storageKey of await findReferencedStorageKeys(keys)) {
      referenced.add(storageKey);
    }
  }
  return referenced;
}

async function deleteIfStillOldAndUnchanged(
  candidate: ArtifactCandidate,
  cutoffMs: number,
): Promise<boolean> {
  let stat: Awaited<ReturnType<typeof fs.lstat>>;
  try {
    stat = await fs.lstat(candidate.absolutePath);
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.mtimeMs > cutoffMs ||
    stat.dev !== candidate.device ||
    stat.ino !== candidate.inode
  ) {
    return false;
  }

  try {
    await fs.unlink(candidate.absolutePath);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

export class CrawlLatestArtifactGarbageCollector {
  private readonly now: () => number;
  private readonly minimumAgeMs: number;
  private readonly minimumIntervalMs: number;
  private nextAllowedAt = 0;
  private inFlight: Promise<ArtifactGarbageCollectionResult> | null = null;

  constructor(private readonly options: ArtifactGarbageCollectorOptions) {
    this.now = options.now ?? Date.now;
    this.minimumAgeMs =
      options.minimumAgeMs ?? CRAWL_LATEST_ORPHAN_ARTIFACT_TTL_MS;
    this.minimumIntervalMs =
      options.minimumIntervalMs ?? CRAWL_LATEST_ARTIFACT_GC_INTERVAL_MS;
    if (this.minimumAgeMs <= 0 || this.minimumIntervalMs <= 0) {
      throw new Error("Crawler artifact GC durations must be positive");
    }
  }

  maybeCollect(): Promise<ArtifactGarbageCollectionResult> {
    if (this.inFlight) return this.inFlight;

    const startedAt = this.now();
    if (startedAt < this.nextAllowedAt) {
      return Promise.resolve({ status: "skipped", reason: "interval" });
    }
    this.nextAllowedAt = startedAt + this.minimumIntervalMs;

    const operation = this.runOnce(startedAt).finally(() => {
      if (this.inFlight === operation) this.inFlight = null;
    });
    this.inFlight = operation;
    return operation;
  }

  private async runOnce(
    startedAt: number,
  ): Promise<ArtifactGarbageCollectionResult> {
    const collect = () => this.collect(startedAt);
    if (!this.options.runExclusive) return collect();

    const locked = await this.options.runExclusive(collect);
    return locked.acquired
      ? locked.value
      : { status: "skipped", reason: "lock-unavailable" };
  }

  private async collect(
    startedAt: number,
  ): Promise<ArtifactGarbageCollectionResult> {
    const artifactRoot = path.resolve(this.options.artifactRoot());
    const cutoffMs = startedAt - this.minimumAgeMs;
    const { candidates, scannedFileCount } = await listOldGzipCandidates(
      artifactRoot,
      cutoffMs,
    );
    if (candidates.length === 0) {
      return {
        status: "completed",
        scannedFileCount,
        candidateCount: 0,
        referencedCount: 0,
        deletedCount: 0,
      };
    }

    const initiallyReferenced = await findReferencesInBatches(
      candidates,
      this.options.findReferencedStorageKeys,
    );
    const initiallyOrphaned = candidates.filter(
      candidate => !initiallyReferenced.has(candidate.storageKey),
    );
    // Re-check immediately before unlinking. The 24-hour grace period is the
    // primary upload/run-registration race guard; this second DB read narrows
    // the remaining window without holding a database transaction during I/O.
    const newlyReferenced = await findReferencesInBatches(
      initiallyOrphaned,
      this.options.findReferencedStorageKeys,
    );

    let deletedCount = 0;
    for (const candidate of initiallyOrphaned) {
      if (newlyReferenced.has(candidate.storageKey)) continue;
      if (await deleteIfStillOldAndUnchanged(candidate, cutoffMs)) {
        deletedCount += 1;
      }
    }

    return {
      status: "completed",
      scannedFileCount,
      candidateCount: candidates.length,
      referencedCount: new Set([...initiallyReferenced, ...newlyReferenced])
        .size,
      deletedCount,
    };
  }
}

const productionCollector = new CrawlLatestArtifactGarbageCollector({
  artifactRoot: () => {
    const configured = process.env.CRAWLER_ARTIFACT_ROOT?.trim();
    if (!configured) throw new Error("CRAWLER_ARTIFACT_ROOT is not configured");
    return configured;
  },
  findReferencedStorageKeys: async storageKeys => {
    if (storageKeys.length === 0) return new Set();
    const { prisma } = await import("@/lib/prisma");
    const artifacts = await prisma.crawlLatestArtifact.findMany({
      where: { storageKey: { in: [...storageKeys] } },
      select: { storageKey: true },
    });
    return new Set(
      artifacts.flatMap(artifact =>
        artifact.storageKey ? [artifact.storageKey] : [],
      ),
    );
  },
  runExclusive: async task => {
    const { withPostgresAdvisoryLock } = await import("@/lib/prisma");
    return withPostgresAdvisoryLock(
      ARTIFACT_GC_LOCK_NAMESPACE,
      ARTIFACT_GC_LOCK_KEY,
      async () => {
        const { expireReferencedArtifactsDirect } = await import(
          "./artifactRetention"
        );
        await expireReferencedArtifactsDirect();
        return task();
      },
    );
  },
});

export const maybeCollectOrphanedCrawlLatestArtifacts = () =>
  productionCollector.maybeCollect();
