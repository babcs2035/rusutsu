import type { Metadata } from "next";
import { ResortAdminClient } from "@/features/resort/ResortAdminClient";
import { readAdminSkiResorts } from "@/lib/skiResortData";
import { requireEditingPage } from "@/server/edit-requests/authPages";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "スキー場マスター編集 | 管理画面",
};

export default async function ResortAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string | string[] }>;
}) {
  await requireEditingPage();
  const [resorts, { id }] = await Promise.all([
    readAdminSkiResorts(),
    searchParams,
  ]);

  return (
    <ResortAdminClient
      initialResorts={resorts}
      initialSelectedId={typeof id === "string" ? id : null}
    />
  );
}
