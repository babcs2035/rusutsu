import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/server/edit-requests/authPages";

export default async function CorrectionsPage() {
  await requireAdminPage();
  const requests = await prisma.editRequest.findMany({
    where: { kind: "public-correction" },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return (
    <main className="mx-auto max-w-4xl p-4">
      <h1 className="mb-4 text-xl font-bold">情報修正の確認</h1>
      <div className="space-y-2">
        {requests.map(request => (
          <Link
            key={request.id}
            href={`/admin/corrections/${request.id}`}
            className="block rounded border p-3 hover:bg-slate-50"
          >
            <div className="flex justify-between gap-2">
              <strong>{request.resortId}</strong>
              <span className="text-xs text-slate-600">{request.status}</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {request.authorName} · {request.createdAt.toLocaleString("ja-JP")}
            </p>
          </Link>
        ))}
      </div>
    </main>
  );
}
