import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { TrackAnalysis } from "@/features/ski-tracks/contract";
import {
  MAX_SKIZ_BYTES,
  parseSkiz,
  SkizFormatError,
} from "@/features/ski-tracks/parseSkiz";
import { prisma } from "@/lib/prisma";
import { consumeWriteLimit } from "@/server/community/rateLimit";
import { RequestBodyError, readRequestBytes } from "@/server/readRequestBody";
import { analyzeUpload } from "./analyzeUpload";

const dto = (row: {
  id: string;
  fileName: string;
  importedAt: Date;
  analysis: Prisma.JsonValue;
}) => ({
  id: row.id,
  fileName: row.fileName,
  importedAt: row.importedAt.toISOString(),
  analysis: row.analysis as unknown as TrackAnalysis,
});

export async function handleSkiTracks(
  request: Request,
  authenticate: () => Promise<string | null>,
) {
  const respond = (body: unknown, status = 200) =>
    Response.json(body, {
      status,
      headers: { "Cache-Control": "private, no-store" },
    });
  try {
    if (request.method !== "GET") {
      const origin = request.headers.get("origin");
      const origins = [new URL(request.url).origin];
      if (process.env.AUTH_URL)
        origins.push(new URL(process.env.AUTH_URL).origin);
      if (
        request.headers.get("x-ski-tracks-request") !== "1" ||
        request.headers.get("sec-fetch-site") === "cross-site" ||
        !origin ||
        !origins.includes(origin)
      )
        return respond({ error: "ページを開き直してお試しください。" }, 403);
    }
    const userId = await authenticate();
    if (
      !userId ||
      !(await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      }))
    )
      return respond({ error: "ログインしてからご利用ください。" }, 401);
    if (request.method === "GET") {
      const rows = await prisma.skiTrackImport.findMany({
        where: { userId },
        orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
        take: 500,
      });
      return respond({ tracks: rows.map(dto) });
    }
    if (request.method === "DELETE") {
      const id = new URL(request.url).searchParams.get("id");
      if (!id || id.length > 100)
        return respond({ error: "履歴を選択してください。" }, 400);
      await prisma.skiTrackImport.deleteMany({ where: { id, userId } });
      return respond({ ok: true });
    }
    if (request.method !== "POST")
      return respond({ error: "未対応の操作です。" }, 405);
    if (request.headers.get("content-type") !== "application/octet-stream")
      return respond(
        { error: "SkiTracksの.skizファイルを選んでください。" },
        415,
      );
    let name: string;
    try {
      name = decodeURIComponent(request.headers.get("x-file-name") ?? "");
    } catch {
      return respond({ error: "ファイル名を確認してください。" }, 400);
    }
    if (
      !name.toLowerCase().endsWith(".skiz") ||
      name.length > 255 ||
      /[/\\]/u.test(name) ||
      [...name].some(character => character.charCodeAt(0) < 32)
    )
      return respond(
        { error: "SkiTracksの.skizファイルを選んでください。" },
        400,
      );
    await consumeWriteLimit("ski-tracks-upload", userId, 30);
    const bytes = await readRequestBytes(request, MAX_SKIZ_BYTES);
    const fileHash = createHash("sha256").update(bytes).digest("hex");
    const existing = await prisma.skiTrackImport.findUnique({
      where: { userId_fileHash: { userId, fileHash } },
    });
    if (existing) return respond({ track: dto(existing), duplicate: true });
    if ((await prisma.skiTrackImport.count({ where: { userId } })) >= 500)
      return respond(
        {
          error:
            "保存できる履歴は500件までです。不要な履歴を削除してください。",
        },
        400,
      );
    const analysis = await analyzeUpload(parseSkiz(bytes));
    const row = await prisma.skiTrackImport.upsert({
      where: { userId_fileHash: { userId, fileHash } },
      create: {
        userId,
        fileHash,
        fileName: name,
        recordedAt: new Date(analysis.start),
        analysis: analysis as unknown as Prisma.InputJsonValue,
      },
      update: {},
    });
    return respond({ track: dto(row), duplicate: false });
  } catch (error) {
    if (error instanceof SkizFormatError)
      return respond(
        {
          error:
            "このファイルを読み込めません。SkiTracksから書き出した.skizファイル（滑走区間形式v4）を選択してください。破損・未対応の形式は取り込めません。",
        },
        400,
      );
    if (error instanceof RequestBodyError)
      return respond(
        {
          error:
            error.status === 413
              ? "ファイルは20MBまでです。"
              : "ファイルを送信できませんでした。再度お試しください。",
        },
        error.status,
      );
    if (error instanceof Error && error.message.startsWith("短時間に"))
      return respond({ error: error.message }, 429);
    console.error(
      "SkiTracks request failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return respond(
      {
        error:
          "滑走履歴を処理できませんでした。時間を置いて再度お試しください。",
      },
      503,
    );
  }
}
