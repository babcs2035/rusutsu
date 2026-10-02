import type { Metadata } from "next";
import { ResortAdminClient } from "@/features/resort/ResortAdminClient";
import { readAdminSkiResorts } from "@/lib/skiResortData";
import { requireEditingPage } from "@/server/edit-requests/authPages";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "スキー場マスター編集 | 管理画面",
};

export default async function ResortAdminPage() {
  await requireEditingPage();
  const resorts = await readAdminSkiResorts();

  return <ResortAdminClient initialResorts={resorts} />;
}
