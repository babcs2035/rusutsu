import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createCommunityDraftStorage,
  type DraftBlobStore,
  type DraftMetadataStore,
  type DraftScope,
  type DraftStorageEnvironment,
} from "./draftStorage";

class MemoryMetadata implements DraftMetadataStore {
  values = new Map<string, string>();
  gets = 0;
  throwOnGet?: number;

  get(key: string) {
    this.gets += 1;
    if (this.gets === this.throwOnGet) throw new Error("metadata read failure");
    return this.values.get(key) ?? null;
  }

  set(key: string, value: string) {
    this.values.set(key, value);
  }

  remove(key: string) {
    this.values.delete(key);
  }

  keys() {
    return [...this.values.keys()];
  }
}

class MemoryBlobs implements DraftBlobStore {
  values = new Map<
    string,
    {
      key: string;
      scopeKey: string;
      id: string;
      bytes?: ArrayBuffer;
      blob?: Blob;
      name: string;
      type: string;
      lastModified: number;
    }
  >();
  enabled = true;
  puts = 0;
  beforePut?: () => Promise<void>;

  available() {
    return this.enabled;
  }

  async get(key: string) {
    return this.values.get(key);
  }

  async put(file: Parameters<DraftBlobStore["put"]>[0]) {
    await this.beforePut?.();
    this.puts += 1;
    this.values.set(file.key, file);
  }

  async deleteScope(scopeKey: string) {
    for (const [key, value] of this.values) {
      if (value.scopeKey === scopeKey) this.values.delete(key);
    }
  }

  async keepOnly(scopeKey: string, ids: Set<string>) {
    for (const [key, value] of this.values) {
      if (value.scopeKey === scopeKey && !ids.has(value.id))
        this.values.delete(key);
    }
  }
}

function setup() {
  const metadata = new MemoryMetadata();
  const blobs = new MemoryBlobs();
  let time = Date.parse("2026-10-31T00:00:00Z");
  const environment: DraftStorageEnvironment = {
    metadata,
    blobs,
    now: () => time,
  };
  return {
    storage: createCommunityDraftStorage(environment),
    metadata,
    blobs,
    setTime(value: number) {
      time = value;
    },
  };
}

const scope: DraftScope = {
  userId: "user/one",
  resortId: "resort:one",
};

function photo(name = "photo.jpg") {
  return new File([new Uint8Array([1, 2, 3])], name, {
    type: "image/jpeg",
    lastModified: 100,
  });
}

test("drafts are isolated by user, resort, and edit target", async () => {
  const { storage } = setup();
  const editScope: DraftScope = { ...scope, postId: "post/1" };
  await storage.saveDraft(scope, { body: "new" }, []);
  await storage.saveDraft(
    { ...scope, resortId: "resort:two" },
    { body: "other resort" },
    [],
  );
  await storage.saveDraft(
    { ...scope, userId: "user/two" },
    { body: "other user" },
    [],
  );
  await storage.saveDraft(editScope, { body: "edit" }, []);

  assert.deepEqual(await storage.loadDraft(scope), {
    data: { body: "new" },
    files: [],
    photosMissing: false,
  });
  assert.deepEqual(
    (await storage.loadDraft({ ...scope, resortId: "resort:two" }))?.data,
    { body: "other resort" },
  );
  assert.deepEqual(
    (await storage.loadDraft({ ...scope, userId: "user/two" }))?.data,
    { body: "other user" },
  );
  assert.deepEqual((await storage.loadDraft(editScope))?.data, {
    body: "edit",
  });
});

test("drafts expire after 24 hours and are removed on load", async () => {
  const { storage, metadata, setTime } = setup();
  await storage.saveDraft(scope, { body: "draft" }, []);
  setTime(Date.parse("2026-11-01T00:00:00Z"));
  assert.equal(await storage.loadDraft(scope), null);
  assert.equal(metadata.keys().length, 0);
});

test("loading a draft removes expired records and blobs for other scopes", async () => {
  const { storage, metadata, blobs, setTime } = setup();
  const otherScope = { ...scope, resortId: "resort:old" };
  await storage.saveDraft(otherScope, { body: "old" }, [photo()]);
  setTime(Date.parse("2026-10-31T23:00:00Z"));
  await storage.saveDraft(scope, { body: "current" }, []);
  assert.equal(blobs.values.size, 1);

  setTime(Date.parse("2026-11-01T00:00:00Z"));
  assert.deepEqual((await storage.loadDraft(scope))?.data, { body: "current" });
  assert.equal(metadata.keys().length, 1);
  assert.deepEqual((await storage.loadDraft(scope))?.data, { body: "current" });
  assert.equal(blobs.values.size, 0);
});

test("blob files survive loads while unchanged File objects are not rewritten", async () => {
  const { storage, blobs } = setup();
  const file = photo();
  const first = await storage.saveDraft(scope, { body: "one" }, [file]);
  const second = await storage.saveDraft(scope, { body: "two" }, [file]);
  const loaded = await storage.loadDraft(scope);

  assert.deepEqual(first, { photosSaved: true });
  assert.deepEqual(second, { photosSaved: true });
  assert.equal(blobs.puts, 1);
  assert.ok(blobs.values.values().next().value?.bytes instanceof ArrayBuffer);
  assert.equal(loaded?.files.length, 1);
  assert.equal(loaded?.files[0]?.name, "photo.jpg");
  assert.equal(await loaded?.files[0]?.text(), "\u0001\u0002\u0003");
  assert.equal(loaded?.photosMissing, false);
});

test("a stale pending-write marker does not hide a photo that is present", async () => {
  const { storage, metadata } = setup();
  await storage.saveDraft(scope, { body: "draft" }, [photo()]);
  const key = metadata.keys()[0];
  assert.ok(key);
  const record = JSON.parse(metadata.get(key) ?? "{}") as Record<
    string,
    unknown
  >;
  record.photosMissing = true;
  metadata.set(key, JSON.stringify(record));

  const loaded = await storage.loadDraft(scope);
  assert.equal(loaded?.files.length, 1);
  assert.equal(loaded?.photosMissing, false);
});

test("legacy Blob records still reconstruct as Files", async () => {
  const { storage, metadata, blobs } = setup();
  await storage.saveDraft(scope, { body: "legacy" }, [photo()]);
  const key = metadata.keys()[0];
  assert.ok(key);
  const record = JSON.parse(metadata.get(key) ?? "{}") as {
    files: { id: string; name: string; type: string; lastModified: number }[];
  };
  const manifest = record.files[0];
  assert.ok(manifest);
  blobs.values.set(`${key}:${manifest.id}`, {
    key: `${key}:${manifest.id}`,
    scopeKey: key,
    id: manifest.id,
    blob: new Blob(["legacy bytes"], { type: "image/jpeg" }),
    name: manifest.name,
    type: manifest.type,
    lastModified: manifest.lastModified,
  });

  const loaded = await storage.loadDraft(scope);
  assert.equal(loaded?.files[0]?.name, "photo.jpg");
  assert.equal(await loaded?.files[0]?.text(), "legacy bytes");
});

test("missing or unavailable blobs are reported while text remains loadable", async () => {
  const { storage, blobs } = setup();
  await storage.saveDraft(scope, { body: "draft" }, [photo()]);
  blobs.values.clear();
  const missing = await storage.loadDraft(scope);
  assert.deepEqual(missing?.data, { body: "draft" });
  assert.equal(missing?.photosMissing, true);
  assert.equal(missing?.files.length, 0);

  blobs.enabled = false;
  const result = await storage.saveDraft(scope, { body: "updated" }, [
    photo("new.jpg"),
  ]);
  assert.equal(result.photosSaved, false);
  assert.match(result.warning ?? "", /Photos could not be saved/);
  const unavailable = await storage.loadDraft(scope);
  assert.deepEqual(unavailable?.data, { body: "updated" });
  assert.equal(unavailable?.photosMissing, true);
});

test("delete prevents an in-flight photo write from leaving a draft or blob", async () => {
  const { storage, blobs, metadata } = setup();
  let signalStarted!: () => void;
  let releaseWrite!: () => void;
  const started = new Promise<void>(resolve => {
    signalStarted = resolve;
  });
  const blocked = new Promise<void>(resolve => {
    releaseWrite = resolve;
  });
  blobs.beforePut = async () => {
    signalStarted();
    await blocked;
  };
  const saving = storage.saveDraft(scope, { body: "draft" }, [photo()]);
  await started;
  const deleting = storage.deleteDraft(scope);
  releaseWrite();
  await Promise.all([saving, deleting]);

  assert.equal(metadata.keys().length, 0);
  assert.equal(blobs.values.size, 0);
  assert.equal(await storage.loadDraft(scope), null);
});

test("damaged metadata with invalid revision, expiry, or manifest is rejected", async () => {
  for (const mutate of [
    (record: Record<string, unknown>) => {
      record.revision = "";
    },
    (record: Record<string, unknown>) => {
      record.expiresAt = null;
    },
    (record: Record<string, unknown>) => {
      record.files = [{ id: "", name: "x", type: "", lastModified: 1 }];
    },
    (record: Record<string, unknown>) => {
      record.files = [
        { id: "duplicate", name: "a", type: "", lastModified: 1 },
        { id: "duplicate", name: "b", type: "", lastModified: 1 },
      ];
    },
  ]) {
    const { storage, metadata } = setup();
    await storage.saveDraft(scope, { body: "draft" }, []);
    const key = metadata.keys()[0];
    assert.ok(key);
    const record = JSON.parse(metadata.get(key) ?? "{}") as Record<
      string,
      unknown
    >;
    mutate(record);
    metadata.set(key, JSON.stringify(record));
    await assert.rejects(storage.loadDraft(scope), /Could not read the saved/);
  }
});

test("failed queued metadata reads reject without an unhandled queue rejection", async () => {
  const { storage, metadata } = setup();
  metadata.throwOnGet = 2;
  const unhandled: unknown[] = [];
  const captureUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on("unhandledRejection", captureUnhandled);
  try {
    await assert.rejects(
      storage.saveDraft(scope, { body: "draft" }, []),
      /Could not update the saved/,
    );
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(unhandled, []);
  } finally {
    process.off("unhandledRejection", captureUnhandled);
  }
});

test("a rejected IndexedDB open is retried on the next draft save", async () => {
  const values = new Map<string, string>();
  const fakeWindow = {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  };
  let openCalls = 0;
  const fakeIndexedDb = {
    open() {
      openCalls += 1;
      const request = {
        error: new Error("temporary IndexedDB open failure"),
        onerror: null as (() => void) | null,
        onblocked: null as (() => void) | null,
      };
      queueMicrotask(() => request.onerror?.());
      return request;
    },
  };
  const originalWindow = globalThis.window;
  const originalIndexedDb = globalThis.indexedDB;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: fakeWindow,
  });
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    value: fakeIndexedDb,
  });
  try {
    const storage = createCommunityDraftStorage();
    const first = await storage.saveDraft(scope, { body: "one" }, [
      photo("1.jpg"),
    ]);
    const second = await storage.saveDraft(scope, { body: "two" }, [
      photo("2.jpg"),
    ]);
    assert.equal(first.photosSaved, false);
    assert.equal(second.photosSaved, false);
    assert.equal(openCalls, 2);
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: originalIndexedDb,
    });
  }
});
