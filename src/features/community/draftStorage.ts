const DRAFT_PREFIX = "rusutsu:community-draft:v1:";
const DATABASE_NAME = "rusutsu-community-drafts";
const DATABASE_VERSION = 1;
const FILE_STORE = "files";
const TTL_MS = 24 * 60 * 60 * 1000;

export type DraftScope = {
  userId: string;
  resortId: string;
  postId?: string;
};

export type LoadedDraft = {
  data: unknown;
  files: File[];
  photosMissing: boolean;
};

export type SaveDraftResult = {
  photosSaved: boolean;
  warning?: string;
};

type FileManifestItem = {
  id: string;
  name: string;
  type: string;
  lastModified: number;
};

type DraftRecord = {
  version: 1;
  expiresAt: number;
  revision: string;
  data: unknown;
  files: FileManifestItem[];
  photosMissing: boolean;
};

type StoredFile = {
  key: string;
  scopeKey: string;
  id: string;
  bytes?: ArrayBuffer;
  /** Legacy value from earlier version-1 stores. */
  blob?: Blob;
  name: string;
  type: string;
  lastModified: number;
};

export type DraftMetadataStore = {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  keys(): string[];
};

export type DraftBlobStore = {
  available(): boolean;
  get(key: string): Promise<StoredFile | undefined>;
  put(file: StoredFile): Promise<void>;
  deleteScope(scopeKey: string): Promise<void>;
  keepOnly(scopeKey: string, ids: Set<string>): Promise<void>;
};

export type DraftStorageEnvironment = {
  metadata: DraftMetadataStore;
  blobs: DraftBlobStore;
  now?: () => number;
};

type DraftStorageApi = {
  saveDraft(
    scope: DraftScope,
    data: unknown,
    files: File[],
  ): Promise<SaveDraftResult>;
  loadDraft(scope: DraftScope): Promise<LoadedDraft | null>;
  deleteDraft(scope: DraftScope): Promise<void>;
};

function encodeScope(scope: DraftScope): string {
  if (!scope.userId || !scope.resortId) {
    throw new Error("Draft storage requires a user and resort.");
  }
  return `${DRAFT_PREFIX}${encodeURIComponent(
    JSON.stringify([
      scope.userId,
      scope.resortId,
      scope.postId ? "edit" : "new",
      scope.postId ?? null,
    ]),
  )}`;
}

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function parseRecord(raw: string | null): DraftRecord | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    const isObject =
      typeof value === "object" && value !== null && !Array.isArray(value);
    const record = value as Partial<DraftRecord>;
    const validFiles =
      Array.isArray(record.files) &&
      record.files.length <= 6 &&
      record.files.every(item => {
        if (typeof item !== "object" || item === null || Array.isArray(item))
          return false;
        const file = item as Partial<FileManifestItem>;
        return (
          typeof file.id === "string" &&
          file.id.length > 0 &&
          typeof file.name === "string" &&
          typeof file.type === "string" &&
          typeof file.lastModified === "number" &&
          Number.isFinite(file.lastModified)
        );
      });
    if (
      !isObject ||
      record.version !== 1 ||
      typeof record.expiresAt !== "number" ||
      !Number.isFinite(record.expiresAt) ||
      typeof record.revision !== "string" ||
      record.revision.length === 0 ||
      !Object.hasOwn(record, "data") ||
      typeof record.photosMissing !== "boolean" ||
      !validFiles ||
      new Set(record.files?.map(file => file.id)).size !== record.files?.length
    ) {
      throw new Error("invalid record");
    }
    return value as DraftRecord;
  } catch {
    throw new Error(
      "The saved community draft is damaged. Clear it and try again.",
    );
  }
}

function browserEnvironment(): DraftStorageEnvironment {
  const metadata: DraftMetadataStore = {
    get(key) {
      return window.localStorage.getItem(key);
    },
    set(key, value) {
      window.localStorage.setItem(key, value);
    },
    remove(key) {
      window.localStorage.removeItem(key);
    },
    keys() {
      return Object.keys(window.localStorage);
    },
  };

  const blobs: DraftBlobStore = {
    available() {
      return typeof indexedDB !== "undefined";
    },
    async get(key) {
      const db = await openDatabase();
      return request<StoredFile | undefined>(
        db.transaction(FILE_STORE).objectStore(FILE_STORE).get(key),
      );
    },
    async put(file) {
      const db = await openDatabase();
      await transactionDone(db, store => store.put(file));
    },
    async deleteScope(scopeKey) {
      const db = await openDatabase();
      const tx = db.transaction(FILE_STORE, "readwrite");
      const store = tx.objectStore(FILE_STORE);
      const cursorRequest = store.openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;
        if ((cursor.value as StoredFile).scopeKey === scopeKey) cursor.delete();
        cursor.continue();
      };
      await transactionDonePromise(tx);
    },
    async keepOnly(scopeKey, ids) {
      const db = await openDatabase();
      const tx = db.transaction(FILE_STORE, "readwrite");
      const store = tx.objectStore(FILE_STORE);
      const cursorRequest = store.openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;
        const value = cursor.value as StoredFile;
        if (value.scopeKey === scopeKey && !ids.has(value.id)) cursor.delete();
        cursor.continue();
      };
      await transactionDonePromise(tx);
    },
  };
  return { metadata, blobs };
}

let databasePromise: Promise<IDBDatabase> | undefined;
function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is unavailable."));
  }
  if (!databasePromise) {
    const opening = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(FILE_STORE)) {
          db.createObjectStore(FILE_STORE, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error("Could not open draft storage."));
      request.onblocked = () =>
        reject(new Error("Draft storage is blocked by another tab."));
    });
    databasePromise = opening.catch(error => {
      databasePromise = undefined;
      throw error;
    });
  }
  return databasePromise;
}

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () =>
      reject(value.error ?? new Error("Draft file read failed."));
  });
}

function transactionDone(
  db: IDBDatabase,
  write: (store: IDBObjectStore) => IDBRequest,
): Promise<void> {
  const tx = db.transaction(FILE_STORE, "readwrite");
  write(tx.objectStore(FILE_STORE));
  return transactionDonePromise(tx);
}

function transactionDonePromise(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(tx.error ?? new Error("Draft file storage failed."));
    tx.onabort = () =>
      reject(tx.error ?? new Error("Draft file storage was interrupted."));
  });
}

export function createCommunityDraftStorage(
  environment: DraftStorageEnvironment = browserEnvironment(),
): DraftStorageApi {
  const now = environment.now ?? Date.now;
  const queues = new Map<string, Promise<void>>();
  const generations = new Map<string, number>();
  const fileIds = new WeakMap<File, { id: string; fingerprint: string }>();

  function currentGeneration(key: string) {
    return generations.get(key) ?? 0;
  }

  function enqueue(key: string, operation: () => Promise<void>) {
    const prior = queues.get(key) ?? Promise.resolve();
    const next = prior.catch(() => undefined).then(operation);
    queues.set(key, next);
    const cleanup = () => {
      if (queues.get(key) === next) queues.delete(key);
    };
    // `finally` creates a second rejected promise when `next` rejects.
    // Handle both branches directly so the returned promise remains the only
    // rejection observed by the caller.
    void next.then(cleanup, cleanup);
    return next;
  }

  async function removeKey(key: string) {
    generations.set(key, currentGeneration(key) + 1);
    try {
      environment.metadata.remove(key);
    } catch {
      throw new Error(
        "Could not remove the community draft from this browser.",
      );
    }
    if (environment.blobs.available()) {
      try {
        await enqueue(key, () => environment.blobs.deleteScope(key));
      } catch {
        throw new Error(
          "The draft was removed, but its saved photos could not be cleared.",
        );
      }
    } else {
      await (queues.get(key) ?? Promise.resolve()).catch(() => undefined);
    }
  }

  async function removeDraft(scope: DraftScope) {
    await removeKey(encodeScope(scope));
  }

  async function cleanupExpiredDrafts(exceptKey: string) {
    let keys: string[];
    try {
      keys = environment.metadata.keys();
    } catch {
      return;
    }
    for (const key of keys) {
      if (key === exceptKey || !key.startsWith(DRAFT_PREFIX)) continue;
      try {
        const record = parseRecord(environment.metadata.get(key));
        if (!record || record.expiresAt <= now()) await removeKey(key);
      } catch {
        // An unreadable record cannot be restored; discard it and its blobs.
        try {
          await removeKey(key);
        } catch {
          // Cleanup is best-effort so it cannot block another draft load.
        }
      }
    }
  }

  return {
    async saveDraft(scope, data, files) {
      const key = encodeScope(scope);
      // Serialize now: localStorage is the synchronous pagehide-safe copy.
      let serialized: string;
      try {
        serialized = JSON.stringify(data);
      } catch {
        throw new Error("This draft contains data that cannot be saved.");
      }
      if (serialized === undefined) {
        throw new Error("This draft contains data that cannot be saved.");
      }
      let previous: DraftRecord | null;
      try {
        previous = parseRecord(environment.metadata.get(key));
      } catch {
        throw new Error(
          "Could not read the saved community draft in this browser.",
        );
      }
      const manifest = files.map(file => {
        const fingerprint = `${file.name}\u0000${file.type}\u0000${file.size}\u0000${file.lastModified}`;
        const remembered = fileIds.get(file);
        const id =
          remembered?.fingerprint === fingerprint ? remembered.id : makeId();
        fileIds.set(file, { id, fingerprint });
        return {
          id,
          name: file.name,
          type: file.type,
          lastModified: file.lastModified,
        };
      });
      const revision = makeId();
      const record: DraftRecord = {
        version: 1,
        expiresAt: now() + TTL_MS,
        revision,
        data: JSON.parse(serialized) as unknown,
        files: manifest,
        photosMissing: files.length > 0,
      };
      // A metadata write failure is fatal and reported before queued IDB work.
      try {
        environment.metadata.set(key, JSON.stringify(record));
      } catch {
        throw new Error("Could not save the community draft in this browser.");
      }
      const generation = currentGeneration(key);
      let photosSaved = files.length === 0;
      let warning: string | undefined;
      const operation = enqueue(key, async () => {
        if (currentGeneration(key) !== generation) return;
        if (files.length) {
          if (!environment.blobs.available()) {
            warning =
              "Photos could not be saved in this browser. The draft text was saved.";
          } else {
            try {
              for (let index = 0; index < files.length; index += 1) {
                if (currentGeneration(key) !== generation) return;
                const file = files[index];
                const item = manifest[index];
                if (!file || !item) continue;
                let alreadyStored = false;
                if (previous?.files.some(old => old.id === item.id)) {
                  try {
                    alreadyStored = Boolean(
                      await environment.blobs.get(`${key}:${item.id}`),
                    );
                  } catch {
                    // Retry the current File below if a prior blob was evicted.
                  }
                }
                if (alreadyStored) continue;
                const bytes = await file.arrayBuffer();
                if (currentGeneration(key) !== generation) return;
                await environment.blobs.put({
                  key: `${key}:${item.id}`,
                  scopeKey: key,
                  id: item.id,
                  bytes,
                  name: item.name,
                  type: item.type,
                  lastModified: item.lastModified,
                });
              }
              photosSaved = true;
            } catch {
              warning =
                "Photos could not be saved in this browser. The draft text was saved.";
            }
          }
        }
        if (currentGeneration(key) !== generation) return;
        let latest: DraftRecord | null;
        try {
          latest = parseRecord(environment.metadata.get(key));
        } catch {
          throw new Error(
            "Could not update the saved community draft in this browser.",
          );
        }
        if (latest?.revision === revision && files.length) {
          latest.photosMissing = !photosSaved;
          try {
            environment.metadata.set(key, JSON.stringify(latest));
          } catch {
            // The initial synchronous metadata write already succeeded.
          }
        }
        if (photosSaved && environment.blobs.available()) {
          await environment.blobs
            .keepOnly(key, new Set(manifest.map(item => item.id)))
            .catch(() => undefined);
        }
      });
      await operation;
      return warning ? { photosSaved: false, warning } : { photosSaved };
    },

    async loadDraft(scope) {
      const key = encodeScope(scope);
      await (queues.get(key) ?? Promise.resolve()).catch(() => undefined);
      await cleanupExpiredDrafts(key);
      let record: DraftRecord | null;
      try {
        record = parseRecord(environment.metadata.get(key));
      } catch {
        throw new Error(
          "Could not read the saved community draft in this browser.",
        );
      }
      if (!record) return null;
      if (record.expiresAt <= now()) {
        await removeDraft(scope);
        return null;
      }
      const loadedFiles: File[] = [];
      // This marker can still be true if pagehide interrupted the queued
      // metadata patch after the bytes were committed. Trust the manifest
      // readback: warn only when a referenced photo cannot be recovered.
      let photosMissing = false;
      if (record.files.length && environment.blobs.available()) {
        for (const item of record.files) {
          try {
            const stored = await environment.blobs.get(`${key}:${item.id}`);
            if (!stored) {
              photosMissing = true;
              continue;
            }
            const payload = stored.bytes ?? stored.blob;
            if (!payload) {
              photosMissing = true;
              continue;
            }
            const file = new File([payload], item.name, {
              type: item.type,
              lastModified: item.lastModified,
            });
            fileIds.set(file, {
              id: item.id,
              fingerprint: `${file.name}\u0000${file.type}\u0000${file.size}\u0000${file.lastModified}`,
            });
            loadedFiles.push(file);
          } catch {
            photosMissing = true;
          }
        }
      } else if (record.files.length) {
        photosMissing = true;
      }
      return { data: record.data, files: loadedFiles, photosMissing };
    },

    deleteDraft: removeDraft,
  };
}

const browserStorage = createCommunityDraftStorage();

export const saveDraft = browserStorage.saveDraft;
export const loadDraft = browserStorage.loadDraft;
export const deleteDraft = browserStorage.deleteDraft;
