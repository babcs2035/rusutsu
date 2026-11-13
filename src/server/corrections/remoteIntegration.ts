import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { Client } from "pg";
import sharp from "sharp";

type Runtime = {
  run<T>(
    state: {
      userId: string | null;
      cookies: Map<string, string>;
      actor: { id: string; role: string; name: string } | null;
    },
    task: () => T,
  ): T;
};
type Api = {
  prisma: typeof import("@/lib/prisma").prisma;
  runtime: Runtime;
  submitCorrection: typeof import("@/features/corrections/actions").submitCorrection;
  decideCorrectionItem: typeof import("@/features/corrections/actions").decideCorrectionItem;
  adjustCorrectionItem: typeof import("@/features/corrections/actions").adjustCorrectionItem;
  listCorrections: typeof import("@/server/corrections/repository").listCorrections;
  getCorrection: typeof import("@/server/corrections/repository").getCorrection;
  photoGET: typeof import("@/app/api/community/photos/[photoId]/route").GET;
  internalCommunityPOST: (request: Request) => Promise<Response>;
  internalEditRequestPOST: (request: Request) => Promise<Response>;
  disconnectPrisma: () => Promise<void>;
};

const solveChallenge = (token: string) => {
  for (let nonce = 0; nonce < 1_000_000; nonce++) {
    if (
      createHash("sha256")
        .update(`${token}:${nonce}`)
        .digest("hex")
        .startsWith("0000")
    )
      return String(nonce);
  }
  throw new Error("Challenge proof search exhausted");
};

/** Exercises the anonymous correction and admin review HTTP round trips. */
export async function verifyRemoteCorrections(
  api: Api,
  root: string,
  testDatabase: string,
  ids: { resortId: string; adminId: string; editorId: string },
) {
  const localUrl = new URL(testDatabase);
  assert.equal(localUrl.hostname, "127.0.0.1");
  assert.equal(localUrl.port, "55501");
  assert.equal(localUrl.pathname, "/postgres");
  const databaseName = `corrections_remote_${process.pid}`;
  const admin = new Client({ connectionString: localUrl.href });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  const canonicalUrl = new URL(localUrl);
  canonicalUrl.pathname = `/${databaseName}`;
  const remote = new Client({ connectionString: canonicalUrl.href });
  const savedEnv = {
    DATA_API_BASE_URL: process.env.DATA_API_BASE_URL,
    INTERNAL_DATA_API_ADMIN_TOKEN: process.env.INTERNAL_DATA_API_ADMIN_TOKEN,
    AUTH_SECRET: process.env.AUTH_SECRET,
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
      path.join(root, "corrections-resort-seed.json"),
      JSON.stringify(resort),
    );
    const remoteAdminId = `canonical-${ids.adminId}`;
    const remoteEditorId = `canonical-${ids.editorId}`;
    const accountIds = [
      [ids.adminId, remoteAdminId, "admin"],
      [ids.editorId, remoteEditorId, "editor"],
    ] as const;
    for (const [localId] of accountIds) {
      await api.prisma.account.create({
        data: {
          userId: localId,
          type: "oauth",
          provider: "google",
          providerAccountId: `correction-google-${localId}`,
        },
      });
    }
    for (const [localId, canonicalId, role] of accountIds) {
      await remote.query("INSERT INTO users (id,name,role) VALUES ($1,$2,$3)", [
        canonicalId,
        canonicalId,
        role,
      ]);
      await remote.query(
        'INSERT INTO accounts (id,"userId",type,provider,"providerAccountId") VALUES ($1,$2,$3,$4,$5)',
        [
          `account-${canonicalId}`,
          canonicalId,
          "oauth",
          "google",
          `correction-google-${localId}`,
        ],
      );
    }

    const runner = path.join(root, "corrections-remote-server.mjs");
    await fs.writeFile(
      runner,
      `
      import http from 'node:http'; import fs from 'node:fs/promises';
      import {prisma, internalCommunityPOST, internalEditRequestPOST, runtime, disconnectPrisma} from './integration.mjs';
      const resort=JSON.parse(await fs.readFile(new URL('./corrections-resort-seed.json',import.meta.url),'utf8'));
      await prisma.skiResort.create({data:resort});
      const server=http.createServer(async(req,res)=>{try{const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks);const request=new Request('http://127.0.0.1'+req.url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body,duplex:'half'}:{})});const handler=req.url.startsWith('/rusutsu/api/internal/v1/community')?internalCommunityPOST:internalEditRequestPOST;const response=await runtime.run({userId:null,actor:null,cookies:new Map()},()=>handler(request));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch(error){res.writeHead(500);res.end(String(error));}});
      server.listen(0,'127.0.0.1',()=>process.send({port:server.address().port}));
      process.on('message',async value=>{if(value==='stop'){server.close();await disconnectPrisma();process.exit(0);}});
      `,
    );
    child = spawn(process.execPath, [runner], {
      env: {
        ...process.env,
        DATABASE_URL: canonicalUrl.href,
        DATA_API_BASE_URL: "",
        AUTH_SECRET: "canonical-correction-test-secret",
        INTERNAL_DATA_API_ADMIN_TOKEN: "correction-test-admin-token",
        INTERNAL_DATA_API_CRAWLER_TOKEN: "correction-test-crawler-token",
        INTERNAL_DATA_API_DIAGNOSTICS_TOKEN:
          "correction-test-diagnostics-token",
        DISABLE_EDIT_REQUEST_JOBS: "true",
      },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    let stderr = "";
    child.stderr?.on("data", chunk => (stderr += chunk.toString()));
    const port = await new Promise<number>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`Correction test server timeout: ${stderr}`)),
        15_000,
      );
      child?.once("message", value => {
        clearTimeout(timeout);
        resolve((value as { port: number }).port);
      });
      child?.once("exit", () => {
        clearTimeout(timeout);
        reject(new Error(`Correction test server exited: ${stderr}`));
      });
    });
    const base = `http://127.0.0.1:${port}/rusutsu`;
    const token = "correction-test-admin-token";
    process.env.DATA_API_BASE_URL = base;
    process.env.INTERNAL_DATA_API_ADMIN_TOKEN = token;

    const actor = (userId: string | null) => ({
      userId,
      actor: userId
        ? {
            id: userId,
            role: userId === ids.adminId ? "admin" : "editor",
            name: userId,
          }
        : null,
      cookies: new Map<string, string>(),
    });
    const anonymousState = actor(null);
    const proposal = (
      operationKey: string,
      proof?: { token: string; nonce: string },
    ) => ({
      operationKey,
      resortId: ids.resortId,
      items: [
        {
          targetKind: "resort" as const,
          field: "descriptionShort",
          proposed: "remote correction",
        },
      ],
      ...(proof ? { proof } : {}),
    });
    const submitAsAnonymous = (
      state: ReturnType<typeof actor>,
      operationKey = crypto.randomUUID(),
      proof?: { token: string; nonce: string },
      photos = new FormData(),
    ) =>
      api.runtime.run(state, () =>
        api.submitCorrection(proposal(operationKey, proof), photos),
      );

    const localBefore = await api.prisma.editRequest.count({
      where: { kind: "public-correction", resortId: ids.resortId },
    });
    const firstKey = crypto.randomUUID();
    const first = await submitAsAnonymous(anonymousState, firstKey);
    assert.equal(first.ok, true, JSON.stringify(first));
    const replay = await submitAsAnonymous(anonymousState, firstKey);
    assert.deepEqual(replay, first);
    assert.equal(
      await api.prisma.editRequest.count({
        where: { kind: "public-correction", resortId: ids.resortId },
      }),
      localBefore,
    );
    assert.equal(
      (
        await remote.query(
          'SELECT count(*)::int AS count FROM edit_requests WHERE "submissionKey" IS NOT NULL AND "kind"=$1 AND "resortId"=$2',
          ["public-correction", ids.resortId],
        )
      ).rows[0].count,
      1,
    );

    // The challenge is issued and verified using the canonical server secret,
    // which intentionally differs from the local app secret.
    let challengeResult: Awaited<ReturnType<typeof submitAsAnonymous>> | null =
      null;
    for (let index = 0; index < 6; index++) {
      challengeResult = await submitAsAnonymous(anonymousState);
      if (!challengeResult.ok && challengeResult.challenge) break;
    }
    assert.ok(
      challengeResult && !challengeResult.ok && challengeResult.challenge,
    );
    const proof = {
      token: challengeResult.challenge.token,
      nonce: solveChallenge(challengeResult.challenge.token),
    };
    const challengedSubmit = await submitAsAnonymous(
      anonymousState,
      crypto.randomUUID(),
      proof,
    );
    assert.equal(challengedSubmit.ok, true, JSON.stringify(challengedSubmit));

    const image = await sharp({
      create: {
        width: 8,
        height: 8,
        channels: 3,
        background: { r: 0, g: 40, b: 210 },
      },
    })
      .png()
      .toBuffer();
    const threePhotos = new FormData();
    for (let index = 0; index < 3; index++)
      threePhotos.append(
        "photos",
        new File([new Uint8Array(image)], `photo-${index}.png`, {
          type: "image/png",
        }),
      );
    const photoResult = await submitAsAnonymous(
      actor(null),
      crypto.randomUUID(),
      undefined,
      threePhotos,
    );
    assert.equal(photoResult.ok, true, JSON.stringify(photoResult));
    const photoRows = await remote.query(
      'SELECT id,"mimeType" FROM contribution_photos WHERE "requestId"=$1 ORDER BY id',
      [photoResult.requestId],
    );
    assert.equal(photoRows.rowCount, 3);
    assert.ok(photoRows.rows.every(row => row.mimeType === "image/webp"));

    const communityEndpoint = `${base}/api/internal/v1/community`;
    const noIdentity = await fetch(communityEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        command: {
          operation: "correction",
          input: proposal(crypto.randomUUID()),
        },
        googleAccountId: null,
      }),
    });
    assert.equal(noIdentity.status, 422);
    const fourPhotos = new FormData();
    fourPhotos.set(
      "command",
      JSON.stringify({
        command: {
          operation: "correction",
          input: proposal(crypto.randomUUID()),
        },
        googleAccountId: null,
        anonymousIdentity: "a".repeat(64),
        submissionKey: "b".repeat(64),
      }),
    );
    for (let index = 0; index < 4; index++)
      fourPhotos.append(
        "photos",
        new File([new Uint8Array(image)], `extra-${index}.png`, {
          type: "image/png",
        }),
      );
    const tooManyPhotos = await fetch(communityEndpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fourPhotos,
    });
    assert.equal(tooManyPhotos.status, 413);

    const adminState = actor(ids.adminId);
    const photoId = photoRows.rows[0].id as string;
    const hidden = await api.runtime.run(actor(null), () =>
      api.photoGET(new Request("http://localhost"), {
        params: Promise.resolve({ photoId }),
      }),
    );
    assert.equal(hidden.status, 404);
    const visible = await api.runtime.run(adminState, () =>
      api.photoGET(new Request("http://localhost"), {
        params: Promise.resolve({ photoId }),
      }),
    );
    assert.equal(visible.status, 200);
    assert.equal(visible.headers.get("content-type"), "image/webp");

    const list = await api.runtime.run(adminState, () => api.listCorrections());
    assert.ok(
      list.requests.some(request => request.id === photoResult.requestId),
    );
    const detail = await api.runtime.run(adminState, () =>
      api.getCorrection(photoResult.requestId),
    );
    assert.equal(detail.request?.photos.length, 3);
    const stale = detail.request?.version ?? 0;
    const adjusted = await api.runtime.run(adminState, () =>
      api.adjustCorrectionItem(photoResult.requestId, stale, 0, "adjusted"),
    );
    assert.equal(adjusted.ok, true, JSON.stringify(adjusted));
    const staleDecision = await api.runtime.run(adminState, () =>
      api.decideCorrectionItem(photoResult.requestId, stale, 0, "reject"),
    );
    assert.equal(staleDecision.ok, false);
    const currentDecision = await api.runtime.run(adminState, () =>
      api.decideCorrectionItem(
        photoResult.requestId,
        adjusted.version,
        0,
        "reject",
      ),
    );
    assert.equal(currentDecision.ok, true, JSON.stringify(currentDecision));

    const originalLocalDescription = (
      await api.prisma.skiResort.findUniqueOrThrow({
        where: { id: ids.resortId },
        select: { descriptionShort: true },
      })
    ).descriptionShort;
    const approval = await submitAsAnonymous(actor(null));
    assert.equal(approval.ok, true, JSON.stringify(approval));
    const approved = await api.runtime.run(adminState, () =>
      api.decideCorrectionItem(approval.requestId, 1, 0, "approve"),
    );
    assert.equal(approved.ok, true, JSON.stringify(approved));
    assert.equal(
      (
        await remote.query(
          'SELECT "descriptionShort" FROM ski_resorts WHERE id=$1',
          [ids.resortId],
        )
      ).rows[0].descriptionShort,
      "remote correction",
    );
    assert.equal(
      (
        await api.prisma.skiResort.findUniqueOrThrow({
          where: { id: ids.resortId },
          select: { descriptionShort: true },
        })
      ).descriptionShort,
      originalLocalDescription,
    );

    const editorResponse = await fetch(
      `${base}/api/internal/v1/edit-requests`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          operation: "correction-list",
          googleAccountId: `correction-google-${ids.editorId}`,
        }),
      },
    );
    assert.equal(editorResponse.status, 403);
    const unauthorizedResponse = await fetch(
      `${base}/api/internal/v1/edit-requests`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer wrong-correction-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          operation: "correction-list",
          googleAccountId: `correction-google-${ids.adminId}`,
        }),
      },
    );
    assert.equal(unauthorizedResponse.status, 401);

    const remoteCountBeforeOutage = (
      await remote.query(
        'SELECT count(*)::int AS count FROM edit_requests WHERE "kind"=$1 AND "resortId"=$2',
        ["public-correction", ids.resortId],
      )
    ).rows[0].count;
    process.env.DATA_API_BASE_URL = "http://127.0.0.1:1/rusutsu";
    const outageResult = await submitAsAnonymous(actor(null));
    assert.equal(outageResult.ok, false);
    assert.equal(
      await api.prisma.editRequest.count({
        where: { kind: "public-correction", resortId: ids.resortId },
      }),
      localBefore,
    );
    assert.equal(
      (
        await remote.query(
          'SELECT count(*)::int AS count FROM edit_requests WHERE "kind"=$1 AND "resortId"=$2',
          ["public-correction", ids.resortId],
        )
      ).rows[0].count,
      remoteCountBeforeOutage,
    );
  } finally {
    if (child?.connected) {
      child.send("stop");
      const exited = await Promise.race([
        new Promise<boolean>(resolve =>
          child?.once("exit", () => resolve(true)),
        ),
        new Promise<boolean>(resolve => setTimeout(() => resolve(false), 5000)),
      ]);
      if (!exited) child.kill("SIGKILL");
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
          in: [ids.adminId, ids.editorId].map(id => `correction-google-${id}`),
        },
      },
    });
    if (savedEnv.DATA_API_BASE_URL === undefined)
      delete process.env.DATA_API_BASE_URL;
    else process.env.DATA_API_BASE_URL = savedEnv.DATA_API_BASE_URL;
    for (const [key, value] of [
      ["INTERNAL_DATA_API_ADMIN_TOKEN", savedEnv.INTERNAL_DATA_API_ADMIN_TOKEN],
      ["AUTH_SECRET", savedEnv.AUTH_SECRET],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
