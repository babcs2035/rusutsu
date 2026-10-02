import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import type { z } from "zod";
import type { adminSkiResortUpdateSchema } from "@/server/ski-resorts/adminContract";

type Api = typeof import("@/features/links/actions") &
  typeof import("@/features/edit-requests/actions") &
  typeof import("@/server/edit-requests/repository") &
  typeof import("@/server/edit-requests/workflow") &
  typeof import("@/lib/requireEditor") & {
    prisma: typeof import("@/lib/prisma").prisma;
  };
type Actor = <T>(id: string | null, action: () => Promise<T>) => Promise<T>;

/** Invoked only after the parent suite verifies its disposable DB URL. */
export async function verifyRemoteWorkflow(
  api: Api,
  actor: Actor,
  data: z.infer<typeof adminSkiResortUpdateSchema>,
  root: string,
) {
  const localUrl = new URL(process.env.EDITOR_WORKFLOW_TEST_DATABASE_URL ?? "");
  assert.equal(localUrl.hostname, "127.0.0.1");
  assert.equal(localUrl.port, "55489");
  assert.equal(localUrl.pathname, "/postgres");
  const databaseName = `editor_workflow_remote_${process.pid}`;
  const admin = new Client({ connectionString: localUrl.href });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  const canonicalUrl = new URL(localUrl);
  canonicalUrl.pathname = `/${databaseName}`;
  const remote = new Client({ connectionString: canonicalUrl.href });
  const savedEnv = {
    DATA_API_BASE_URL: process.env.DATA_API_BASE_URL,
    INTERNAL_DATA_API_ADMIN_TOKEN: process.env.INTERNAL_DATA_API_ADMIN_TOKEN,
  };
  let child: ReturnType<typeof spawn> | undefined;
  try {
    const migration = spawnSync(
      "pnpm",
      ["exec", "prisma", "migrate", "deploy"],
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
    for (const [id, role] of [
      ["integration-admin", "admin"],
      ["integration-editor", "editor"],
      ["integration-viewer", "viewer"],
    ]) {
      await api.prisma.account.create({
        data: {
          userId: id,
          type: "oauth",
          provider: "google",
          providerAccountId: `test-google-${id}`,
        },
      });
      const remoteId = id.replace("integration-", "canonical-");
      await remote.query(
        "INSERT INTO users (id, name, role) VALUES ($1, $2, $3)",
        [remoteId, remoteId, role],
      );
      await remote.query(
        'INSERT INTO accounts (id, "userId", type, provider, "providerAccountId") VALUES ($1,$2,$3,$4,$5)',
        [
          `account-${remoteId}`,
          remoteId,
          "oauth",
          "google",
          `test-google-${id}`,
        ],
      );
    }
    const { nameRuby: _ruby, formerNames: _former, ...scalars } = data;
    await fs.writeFile(
      path.join(root, "remote-seed.json"),
      JSON.stringify(scalars),
    );
    const runner = path.join(root, "remote-server.mjs");
    await fs.writeFile(
      runner,
      `
      import http from 'node:http';
      import fs from 'node:fs/promises';
      import { prisma, internalEditRequestPOST, disconnectPrisma } from './integration-bundle.mjs';
      await prisma.skiResort.create({data:{id:'integration-resort',...JSON.parse(await fs.readFile(new URL('./remote-seed.json',import.meta.url),'utf8'))}});
      const server=http.createServer(async (req,res)=>{
        try {
          const chunks=[];for await(const chunk of req)chunks.push(chunk);
          const request=new Request('http://127.0.0.1'+req.url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})});
          const response=await internalEditRequestPOST(request);
          res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
        }catch {res.writeHead(500);res.end('test server failure');}
      });
      server.listen(0,'127.0.0.1',()=>process.send({port:server.address().port}));
      process.on('message',async value=>{if(value==='stop'){server.close();await disconnectPrisma();process.exit(0);}});
    `,
    );
    child = spawn(process.execPath, [runner], {
      env: {
        ...process.env,
        DATABASE_URL: canonicalUrl.href,
        DATA_API_BASE_URL: "",
        INTERNAL_DATA_API_ADMIN_TOKEN: "test-editor-remote-admin-token",
        INTERNAL_DATA_API_CRAWLER_TOKEN: "test-editor-remote-crawler-token",
        INTERNAL_DATA_API_DIAGNOSTICS_TOKEN:
          "test-editor-remote-diagnostics-token",
        DISABLE_EDIT_REQUEST_JOBS: "true",
      },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    let stderr = "";
    child.stderr?.on("data", chunk => {
      stderr += chunk.toString();
    });
    const port = await new Promise<number>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`Remote test server did not start: ${stderr}`)),
        15_000,
      );
      child?.once("message", value => {
        clearTimeout(timeout);
        resolve((value as { port: number }).port);
      });
      child?.once("exit", () => {
        clearTimeout(timeout);
        reject(new Error(`Remote test server exited: ${stderr}`));
      });
    });
    const base = `http://127.0.0.1:${port}/rusutsu`;
    process.env.DATA_API_BASE_URL = base;
    process.env.INTERNAL_DATA_API_ADMIN_TOKEN =
      "test-editor-remote-admin-token";
    const endpoint = `${base}/api/internal/v1/edit-requests`;
    const raw = (body: unknown, token = "test-editor-remote-admin-token") =>
      fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
    assert.equal(
      (
        await raw(
          {
            operation: "list",
            googleAccountId: "test-google-integration-admin",
          },
          "wrong-token",
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await raw(
          {
            operation: "list",
            googleAccountId: "test-google-integration-admin",
          },
          "test-editor-remote-crawler-token",
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await raw({
          operation: "list",
          googleAccountId: "test-google-integration-viewer",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await raw({
          operation: "list",
          googleAccountId: "unknown-google-account",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await raw({
          operation: "list",
          googleAccountId: "test-google-integration-editor",
          role: "admin",
        })
      ).status,
      422,
    );

    const localDocument = await api.prisma.dataDocument.findUnique({
      where: { key: "SkiResortLinks.json" },
    });
    const result = await actor("integration-editor", () =>
      api.saveResortLink({
        resortId: "integration-resort",
        platform: "officialSiteUrls",
        links: [{ url: "https://example.invalid/remote-proposed" }],
        expectedLinks: [],
      }),
    );
    assert.equal(result.ok, true);
    assert.ok(result.ok && result.submission);
    const id = result.submission.requestId;
    assert.equal(
      await api.prisma.editRequest.findUnique({ where: { id } }),
      null,
    );
    assert.equal(
      (await remote.query("SELECT count(*)::int AS count FROM data_documents"))
        .rows[0].count,
      0,
    );
    const own = await actor("integration-editor", () => api.getEditRequest(id));
    assert.equal(own.isAdmin, false);
    assert.equal(own.candidatePlan, null);
    assert.ok(!JSON.stringify(own).includes("googleAccountId"));
    const review = await actor("integration-admin", () =>
      api.getEditRequest(id),
    );
    assert.equal(review.isAdmin, true);
    assert.equal(
      (
        await remote.query('SELECT "authorId" FROM edit_requests WHERE id=$1', [
          id,
        ])
      ).rows[0].authorId,
      "canonical-editor",
    );
    const denied = await raw({
      operation: "approve",
      googleAccountId: "test-google-integration-editor",
      id,
      version: 1,
    });
    assert.equal((await denied.json()).result.ok, false);
    const revised = await actor("integration-admin", () =>
      api.saveRequestCandidate(
        id,
        1,
        {
          ...(review.candidatePayload as object),
          links: [{ url: "https://example.invalid/remote-corrected" }],
        },
        "確認済み",
      ),
    );
    assert.equal(revised.ok, true);
    assert.ok(revised.ok);
    const approved = await actor("integration-admin", () =>
      api.approveEditRequest(id, revised.version),
    );
    assert.equal(approved.ok, true);
    assert.equal(
      (await actor("integration-editor", () => api.getEditRequest(id))).status,
      "APPLIED",
    );
    const published = await remote.query(
      "SELECT content FROM data_documents WHERE key='SkiResortLinks.json'",
    );
    assert.ok(published.rows[0].content.includes("remote-corrected"));
    assert.equal(
      (
        await api.prisma.dataDocument.findUnique({
          where: { key: "SkiResortLinks.json" },
        })
      )?.hash,
      localDocument?.hash,
    );
    assert.equal(
      (
        await remote.query(
          'SELECT count(*)::int AS count FROM edit_request_events WHERE "requestId"=$1 AND action=$2',
          [id, "APPLIED"],
        )
      ).rows[0].count,
      1,
    );

    // The master form uses a different success shape from the other tools.
    // Verify that forwarding preserves it and never calls the local writer.
    const remoteResort =
      // Prisma treats timestamp-without-time-zone as UTC. pg otherwise parses
      // it using the test process timezone, unlike the actual API response.
      (
        await remote.query(
          'SELECT "updatedAt" AT TIME ZONE \'UTC\' AS "updatedAt" FROM ski_resorts WHERE id=$1',
          ["integration-resort"],
        )
      ).rows[0];
    const master = (await actor("integration-admin", () =>
      api.runEdit(
        "resort",
        "integration-resort",
        {
          id: "integration-resort",
          request: {
            expectedUpdatedAt: remoteResort.updatedAt.toISOString(),
            data: { ...data, nameJa: "サーバー側で更新した名称" },
          },
        },
        async () => {
          throw new Error("Local writer must not run in remote mode");
        },
      ),
    )) as { status: string; resort: { nameJa: string } };
    assert.equal(master.status, "saved", JSON.stringify(master));
    assert.equal(master.resort.nameJa, "サーバー側で更新した名称");
    assert.equal(
      (
        await remote.query('SELECT "nameJa" FROM ski_resorts WHERE id=$1', [
          "integration-resort",
        ])
      ).rows[0].nameJa,
      "サーバー側で更新した名称",
    );
    assert.notEqual(
      (
        await api.prisma.skiResort.findUnique({
          where: { id: "integration-resort" },
        })
      )?.nameJa,
      "サーバー側で更新した名称",
    );

    await remote.query("INSERT INTO users (id, name, role) VALUES ($1,$2,$3)", [
      "canonical-other",
      "別の編集者",
      "editor",
    ]);
    await remote.query(
      'INSERT INTO accounts (id, "userId", type, provider, "providerAccountId") VALUES ($1,$2,$3,$4,$5)',
      [
        "account-canonical-other",
        "canonical-other",
        "oauth",
        "google",
        "test-google-other",
      ],
    );
    const otherList = await raw({
      operation: "list",
      googleAccountId: "test-google-other",
    });
    assert.equal((await otherList.json()).result.requests.length, 0);
    assert.equal(
      (
        await raw({
          operation: "get",
          googleAccountId: "test-google-other",
          id,
        })
      ).status,
      403,
    );

    await remote.query(
      "UPDATE users SET role='viewer' WHERE id='canonical-admin'",
    );
    await assert.rejects(
      actor("integration-admin", () => api.listEditRequests()),
      /権限/,
    );
    assert.equal(
      (await actor("integration-admin", () => api.approveEditRequest(id, 3)))
        .ok,
      false,
    );
    await assert.rejects(actor(null, () => api.listEditRequests()));
  } finally {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (child && child.exitCode === null) {
      const exited = once(child, "exit");
      child.send("stop");
      const timer = setTimeout(() => child?.kill("SIGKILL"), 5000);
      await exited;
      clearTimeout(timer);
    }
    await remote.end();
    await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
    await admin.end();
  }
}
