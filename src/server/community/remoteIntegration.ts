import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { Client } from "pg";
import sharp from "sharp";
import { COMMUNITY_API_PATH } from "./remoteContract";

type Runtime = {
  run<T>(
    state: {
      session: { user: { id: string } } | null;
      cookies: Map<string, string>;
    },
    task: () => T,
  ): T;
};
type Api = {
  prisma: typeof import("@/lib/prisma").prisma;
  runtime: Runtime;
  internalCommunityPOST: (request: Request) => Promise<Response>;
  publishReport: (input: unknown, photos: FormData) => Promise<unknown>;
  getCommunityAccount: () => Promise<unknown>;
};

/** Runs a real HTTP round trip against a freshly migrated disposable DB. */
export async function verifyRemoteCommunity(
  api: Api,
  root: string,
  testDatabase: string,
  ids: { resortId: string; owner: string; other: string; admin: string },
) {
  const localUrl = new URL(testDatabase);
  assert.equal(localUrl.hostname, "127.0.0.1");
  assert.equal(localUrl.port, "55501");
  assert.equal(localUrl.pathname, "/postgres");
  const databaseName = `community_remote_${process.pid}`;
  const admin = new Client({ connectionString: localUrl.href });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  const canonicalUrl = new URL(localUrl);
  canonicalUrl.pathname = `/${databaseName}`;
  const remote = new Client({ connectionString: canonicalUrl.href });
  const savedEnv = {
    DATA_API_BASE_URL: process.env.DATA_API_BASE_URL,
    INTERNAL_DATA_API_ADMIN_TOKEN: process.env.INTERNAL_DATA_API_ADMIN_TOKEN,
    INTERNAL_DATA_API_CRAWLER_TOKEN:
      process.env.INTERNAL_DATA_API_CRAWLER_TOKEN,
    INTERNAL_DATA_API_DIAGNOSTICS_TOKEN:
      process.env.INTERNAL_DATA_API_DIAGNOSTICS_TOKEN,
  };
  let child: ReturnType<typeof spawn> | undefined;
  try {
    const migrationCli = createRequire(import.meta.url).resolve(
      "prisma/build/index.js",
    );
    const migration = spawnSync(
      process.execPath,
      [migrationCli, "migrate", "deploy"],
      {
        env: {
          ...process.env,
          DATABASE_URL: canonicalUrl.href,
          DATA_API_BASE_URL: "",
        },
        encoding: "utf8",
      },
    );
    assert.equal(migration.status, 0, migration.stderr);
    await remote.connect();

    const resort = await api.prisma.skiResort.findUniqueOrThrow({
      where: { id: ids.resortId },
    });
    await fs.writeFile(
      path.join(root, "community-resort-seed.json"),
      JSON.stringify(resort),
    );
    const canonicalIds = {
      owner: `canonical-${ids.owner}`,
      other: `canonical-${ids.other}`,
      admin: `canonical-${ids.admin}`,
    };
    for (const [key, localId] of Object.entries(ids).filter(
      ([key]) => key !== "resortId",
    )) {
      const canonicalId = canonicalIds[key as keyof typeof canonicalIds];
      const googleAccountId = `community-google-${localId}`;
      await api.prisma.account.create({
        data: {
          userId: localId,
          type: "oauth",
          provider: "google",
          providerAccountId: googleAccountId,
        },
      });
      await remote.query(
        'INSERT INTO users (id,name,role,"publicName","nameMode") VALUES ($1,$2,$3,$4,$5)',
        [
          canonicalId,
          canonicalId,
          key === "admin" ? "admin" : "viewer",
          canonicalId,
          "NICKNAME",
        ],
      );
      await remote.query(
        'INSERT INTO accounts (id,"userId",type,provider,"providerAccountId") VALUES ($1,$2,$3,$4,$5)',
        [
          `account-${canonicalId}`,
          canonicalId,
          "oauth",
          "google",
          googleAccountId,
        ],
      );
    }

    const runner = path.join(root, "community-remote-server.mjs");
    await fs.writeFile(
      runner,
      `
      import http from 'node:http'; import fs from 'node:fs/promises';
      import { prisma, internalCommunityPOST, runtime, disconnectPrisma } from './integration.mjs';
      const resort=JSON.parse(await fs.readFile(new URL('./community-resort-seed.json',import.meta.url),'utf8'));
      await prisma.skiResort.create({data:resort});
      const server=http.createServer(async(req,res)=>{try{const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks);const request=new Request('http://127.0.0.1'+req.url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body,duplex:'half'}:{})});const response=await runtime.run({session:null,cookies:new Map()},()=>internalCommunityPOST(request));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch{res.writeHead(500);res.end('test server failure');}});
      server.listen(0,'127.0.0.1',()=>process.send({port:server.address().port}));
      process.on('message',async value=>{if(value==='stop'){server.close();await disconnectPrisma();process.exit(0);}});
      `,
    );
    child = spawn(process.execPath, [runner], {
      env: {
        ...process.env,
        DATABASE_URL: canonicalUrl.href,
        DATA_API_BASE_URL: "",
        INTERNAL_DATA_API_ADMIN_TOKEN: "community-test-admin-token",
        INTERNAL_DATA_API_CRAWLER_TOKEN: "community-test-crawler-token",
        INTERNAL_DATA_API_DIAGNOSTICS_TOKEN: "community-test-diagnostics-token",
        COMMUNITY_MODERATION_TOKEN: "community-test-moderation-token",
        DISABLE_EDIT_REQUEST_JOBS: "true",
      },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    let stderr = "";
    child.stderr?.on("data", chunk => (stderr += chunk.toString()));
    const port = await new Promise<number>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`Community test server timeout: ${stderr}`)),
        15_000,
      );
      child?.once("message", value => {
        clearTimeout(timeout);
        resolve((value as { port: number }).port);
      });
      child?.once("exit", () => {
        clearTimeout(timeout);
        reject(new Error(`Community test server exited: ${stderr}`));
      });
    });
    const endpoint = `http://127.0.0.1:${port}/rusutsu${COMMUNITY_API_PATH}`;
    const token = "community-test-admin-token";
    const request = (
      command: unknown,
      googleAccountId: string | null,
      bearer = token,
    ) =>
      fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${bearer}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ command, googleAccountId }),
      });
    const accountId = (localId: string) => `community-google-${localId}`;
    const validPrivateCommand = {
      operation: "profile",
      mode: "NICKNAME",
      nickname: "Test User",
    };
    assert.equal(
      (await request(validPrivateCommand, accountId(ids.owner), "wrong-token"))
        .status,
      401,
    );
    assert.equal(
      (
        await request(
          validPrivateCommand,
          accountId(ids.owner),
          "community-test-crawler-token",
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await request(
          validPrivateCommand,
          accountId(ids.owner),
          "community-test-diagnostics-token",
        )
      ).status,
      403,
    );
    assert.equal((await request(validPrivateCommand, null)).status, 401);
    assert.equal(
      (await request(validPrivateCommand, "unknown-google-account")).status,
      403,
    );
    assert.equal(
      (
        await request(
          { operation: "account", userId: "forged" },
          accountId(ids.owner),
        )
      ).status,
      422,
    );

    const photo = new File(
      [
        await sharp({
          create: {
            width: 1,
            height: 1,
            channels: 4,
            background: { r: 255, g: 0, b: 0, alpha: 1 },
          },
        })
          .png()
          .toBuffer(),
      ],
      "tiny.png",
      { type: "image/png" },
    );
    const key = `community-google-${ids.owner}`;
    const clientKey = "00000000-0000-4000-8000-000000000021";
    // 1件の投稿は1項目（ここではコブ）で、日付と時刻を必ず持つ
    const mogulReport = (entryKey: string, body: string) => ({
      observedOn: "2026-10-25",
      observedTime: "10:35",
      entries: [
        {
          clientKey: entryKey,
          kind: "MOGUL",
          courseId: null,
          liftId: null,
          body,
          snowQualities: ["硬め"],
          latitude: 43.5,
          longitude: 142.8,
          depth: "深い",
        },
      ],
    });
    const publishCommand = {
      operation: "publish",
      input: {
        resortId: ids.resortId,
        idempotencyKey: crypto.randomUUID(),
        report: mogulReport(clientKey, "Mogul photo entry"),
      },
    };
    const multipart = () => {
      const form = new FormData();
      form.set(
        "command",
        JSON.stringify({ command: publishCommand, googleAccountId: key }),
      );
      form.append(`photos:${clientKey}`, photo);
      return fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
    };
    const canonicalPostCountBeforeBadPhoto = (
      await remote.query(
        'SELECT count(*)::int AS count FROM community_posts WHERE "authorId"=$1',
        [canonicalIds.owner],
      )
    ).rows[0].count as number;
    const invalidPhotoCommand = structuredClone(publishCommand);
    invalidPhotoCommand.input.idempotencyKey = crypto.randomUUID();
    const invalidPhotoForm = new FormData();
    invalidPhotoForm.set(
      "command",
      JSON.stringify({ command: invalidPhotoCommand, googleAccountId: key }),
    );
    invalidPhotoForm.append(
      "photos:00000000-0000-4000-8000-000000000099",
      photo,
    );
    const invalidPhotoResponse = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: invalidPhotoForm,
    });
    assert.equal(invalidPhotoResponse.status, 200);
    assert.equal((await invalidPhotoResponse.json()).result.ok, false);
    assert.equal(
      (
        await remote.query(
          'SELECT count(*)::int AS count FROM community_posts WHERE "authorId"=$1',
          [canonicalIds.owner],
        )
      ).rows[0].count,
      canonicalPostCountBeforeBadPhoto,
    );
    const published = await multipart();
    assert.equal(published.status, 200);
    const publishedBody = await published.json();
    assert.equal(publishedBody.result.ok, true);
    const postId = publishedBody.result.data.id as string;
    assert.equal(
      await api.prisma.communityPost.count({ where: { id: postId } }),
      0,
    );
    assert.equal(
      (
        await remote.query(
          "SELECT count(*)::int AS count FROM community_posts WHERE id=$1",
          [postId],
        )
      ).rows[0].count,
      1,
    );
    const replay = await multipart();
    assert.equal((await replay.json()).result.data.id, postId);

    const feedResponse = await request(
      { operation: "feed", input: { resortId: ids.resortId } },
      key,
    );
    const feed = await feedResponse.json();
    assert.equal(feed.result.ok, true);
    assert.equal(feed.result.data.posts[0].id, postId);
    assert.equal(feed.result.data.viewerId, canonicalIds.owner);
    assert.equal(feed.result.data.posts[0].entries[0].photos.length, 1);
    const photoId = (
      await remote.query(
        'SELECT id FROM contribution_photos WHERE "postId"=$1',
        [postId],
      )
    ).rows[0].id as string;
    const originalEntryId = (
      await remote.query(
        'SELECT "entryId" FROM contribution_photos WHERE id=$1',
        [photoId],
      )
    ).rows[0].entryId as string;
    const photoResponse = await request({ operation: "photo", photoId }, key);
    assert.equal(photoResponse.status, 200);
    assert.match(photoResponse.headers.get("content-type") ?? "", /image\//);

    const current = feed.result.data.posts[0];
    const {
      id: _entryId,
      targetName: _targetName,
      photos: _entryPhotos,
      ...entryDraft
    } = current.entries[0];
    const retainPhotoUpdateInput = {
      postId,
      version: current.version,
      report: {
        observedOn: "2026-10-25",
        observedTime: "11:00",
        entries: [{ ...entryDraft, body: "updated canonical post" }],
      },
      removePhotoIds: [],
    };
    const deniedEdit = await request(
      { operation: "update", input: retainPhotoUpdateInput },
      accountId(ids.other),
    );
    assert.equal((await deniedEdit.json()).result.ok, false);
    const retainedUpdate = await request(
      { operation: "update", input: retainPhotoUpdateInput },
      key,
    );
    assert.equal((await retainedUpdate.json()).result.ok, true);
    const retainedPhoto = (
      await remote.query(
        'SELECT "entryId" FROM contribution_photos WHERE id=$1',
        [photoId],
      )
    ).rows[0];
    assert.ok(retainedPhoto);
    // 項目はその場で書き換えるので、写真は同じ項目に付いたまま残る
    assert.equal(retainedPhoto.entryId, originalEntryId);
    const retainedDetail = await request({ operation: "detail", postId }, key);
    const retainedPost = (await retainedDetail.json()).result.data.post;
    assert.deepEqual(
      retainedPost.entries[0].photos.map((item: { id: string }) => item.id),
      [photoId],
    );

    const removePhoto = await request(
      {
        operation: "update",
        input: {
          ...retainPhotoUpdateInput,
          version: current.version + 1,
          removePhotoIds: [photoId],
        },
      },
      key,
    );
    assert.equal((await removePhoto.json()).result.ok, true);
    assert.equal(
      (
        await remote.query(
          "SELECT count(*)::int AS count FROM contribution_photos WHERE id=$1",
          [photoId],
        )
      ).rows[0].count,
      0,
    );
    const hiddenPhoto = await request({ operation: "photo", photoId }, key);
    assert.equal(hiddenPhoto.status, 404);

    const liked = await request(
      { operation: "like", postId, liked: true },
      accountId(ids.other),
    );
    assert.equal((await liked.json()).result.ok, true);
    assert.equal(
      (
        await remote.query(
          'SELECT count(*)::int AS count FROM community_likes WHERE "postId"=$1 AND "userId"=$2',
          [postId, canonicalIds.other],
        )
      ).rows[0].count,
      1,
    );
    const commented = await request(
      {
        operation: "comment",
        postId,
        body: "remote comment",
        operationKey: crypto.randomUUID(),
      },
      accountId(ids.other),
    );
    assert.equal((await commented.json()).result.ok, true);
    assert.equal(
      (
        await remote.query(
          'SELECT count(*)::int AS count FROM community_comments WHERE "postId"=$1 AND "authorId"=$2',
          [postId, canonicalIds.other],
        )
      ).rows[0].count,
      1,
    );
    const notifications = await request({ operation: "notifications" }, key);
    const notificationData = (await notifications.json()).result.data;
    assert.ok(notificationData.notifications.length >= 2);
    assert.ok(notificationData.unreadCount >= 2);

    const remoteBase = `http://127.0.0.1:${port}/rusutsu`;
    process.env.DATA_API_BASE_URL = remoteBase;
    process.env.INTERNAL_DATA_API_ADMIN_TOKEN = token;
    const actionAccount = (await api.runtime.run(
      { session: { user: { id: ids.owner } }, cookies: new Map() },
      () => api.getCommunityAccount(),
    )) as { ok?: boolean; data?: { id?: string } };
    assert.equal(actionAccount.ok, true);
    assert.equal(actionAccount.data?.id, canonicalIds.owner);
    const actionPhotos = new FormData();
    const actionPublish = (await api.runtime.run(
      { session: { user: { id: ids.owner } }, cookies: new Map() },
      () =>
        api.publishReport(
          {
            resortId: ids.resortId,
            idempotencyKey: crypto.randomUUID(),
            report: mogulReport(
              crypto.randomUUID(),
              "published through action wrapper",
            ),
          },
          actionPhotos,
        ),
    )) as { ok?: boolean; data?: { id?: string } };
    assert.equal(actionPublish.ok, true);
    const actionPostId = actionPublish.data?.id;
    assert.ok(actionPostId);
    assert.equal(
      await api.prisma.communityPost.count({ where: { id: actionPostId } }),
      0,
    );
    assert.equal(
      (
        await remote.query(
          'SELECT count(*)::int AS count FROM community_posts WHERE id=$1 AND "authorId"=$2',
          [actionPostId, canonicalIds.owner],
        )
      ).rows[0].count,
      1,
    );

    const outageResult = await request(
      { operation: "like", postId, liked: true },
      key,
      "temporarily-disabled-token",
    );
    assert.notEqual(outageResult.status, 200);
    assert.equal(
      await api.prisma.communityLike.count({ where: { postId } }),
      0,
    );
    process.env.DATA_API_BASE_URL = "http://127.0.0.1:1/rusutsu";
    process.env.INTERNAL_DATA_API_ADMIN_TOKEN = token;
    const localPublishInput = {
      resortId: ids.resortId,
      idempotencyKey: crypto.randomUUID(),
      report: mogulReport(crypto.randomUUID(), "must not be saved locally"),
    };
    const localPhotos = new FormData();
    const localPostCountBefore = await api.prisma.communityPost.count({
      where: { authorId: ids.owner },
    });
    const failedLocalPublish = await api.runtime.run(
      { session: { user: { id: ids.owner } }, cookies: new Map() },
      () => api.publishReport(localPublishInput, localPhotos),
    );
    assert.equal(
      await api.prisma.communityPost.count({ where: { authorId: ids.owner } }),
      localPostCountBefore,
    );
    assert.equal((failedLocalPublish as { ok?: boolean }).ok, false);
  } finally {
    if (child?.connected) {
      child.send("stop");
      await new Promise<void>(resolve => child?.once("exit", () => resolve()));
    }
    await remote.end().catch(() => {});
    await admin
      .query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`)
      .catch(() => {});
    await admin.end();
    await api.prisma.account.deleteMany({
      where: {
        provider: "google",
        providerAccountId: {
          in: [ids.owner, ids.other, ids.admin].map(
            id => `community-google-${id}`,
          ),
        },
      },
    });
    if (savedEnv.DATA_API_BASE_URL === undefined)
      delete process.env.DATA_API_BASE_URL;
    else process.env.DATA_API_BASE_URL = savedEnv.DATA_API_BASE_URL;
    for (const [key, value] of [
      ["INTERNAL_DATA_API_ADMIN_TOKEN", savedEnv.INTERNAL_DATA_API_ADMIN_TOKEN],
      [
        "INTERNAL_DATA_API_CRAWLER_TOKEN",
        savedEnv.INTERNAL_DATA_API_CRAWLER_TOKEN,
      ],
      [
        "INTERNAL_DATA_API_DIAGNOSTICS_TOKEN",
        savedEnv.INTERNAL_DATA_API_DIAGNOSTICS_TOKEN,
      ],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
