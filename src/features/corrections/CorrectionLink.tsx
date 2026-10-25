"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export function CorrectionLink({
  resortId,
  context,
  returnTo,
}: {
  resortId: string;
  context?: unknown;
  returnTo?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = new URLSearchParams();
  if (context !== undefined) params.set("context", JSON.stringify(context));
  const preserved =
    returnTo ??
    pathname + (searchParams.size ? `?${searchParams.toString()}` : "");
  const isResortPath =
    preserved.startsWith(`/${resortId}`) && !preserved.startsWith("//");
  const isResortHome =
    preserved.startsWith("/?") &&
    new URLSearchParams(preserved.slice(2)).get("resort") === resortId;
  if (isResortPath || isResortHome) params.set("returnTo", preserved);
  const suffix = params.size ? `?${params.toString()}` : "";
  return (
    <Link
      href={`/corrections/${encodeURIComponent(resortId)}${suffix}`}
      className="text-sm text-blue-700 underline underline-offset-2"
    >
      情報を修正する
    </Link>
  );
}
