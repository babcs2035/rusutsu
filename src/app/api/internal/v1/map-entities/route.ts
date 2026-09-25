import { prisma } from "@/lib/prisma";
import { requireInternalApiRequest } from "@/server/internalApiHttp";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Fixed-ID access, independent of name, order, or grouping. */
export async function GET(request: Request) {
  const authorizationError = requireInternalApiRequest(request, "admin-data");
  if (authorizationError) return authorizationError;
  const params = new URL(request.url).searchParams;
  const kind = params.get("kind"),
    id = params.get("id");
  if (!id || id.length > 1024 || (kind !== "course" && kind !== "lift"))
    return Response.json(
      { error: "kind and id are required" },
      { status: 400 },
    );
  const where = { id, archivedAt: null };
  const entity =
    kind === "course"
      ? await prisma.mapCourse.findFirst({ where, include: { group: true } })
      : await prisma.mapLift.findFirst({ where });
  return Response.json(
    { entity },
    { status: entity ? 200 : 404, headers: { "Cache-Control": "no-store" } },
  );
}
