import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public health probe. Never return schema, credentials or DB error messages. */
export async function GET() {
  try {
    await prisma.$transaction(
      async tx => {
        await tx.$executeRaw`SET LOCAL statement_timeout = '3000ms'`;
        await tx.$queryRaw`SELECT "shortName", "isActive" FROM "ski_resorts" LIMIT 0`;
        await tx.$queryRaw`SELECT "key", "hash", "version" FROM "data_documents" LIMIT 0`;
        await tx.$queryRaw`SELECT "id" FROM "crawl_latest_runs" LIMIT 0`;
        await tx.$queryRaw`SELECT "snapshotId" FROM "crawl_latest_currents" LIMIT 0`;
      },
      { maxWait: 3_000, timeout: 4_000 },
    );
    return Response.json(
      { ready: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { ready: false },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
