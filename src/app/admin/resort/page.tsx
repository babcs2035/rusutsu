import type { Metadata } from "next";
import { ResortAdminClient } from "@/features/resort/ResortAdminClient";
import { requireAdmin } from "@/lib/requireAdmin";
import { readAdminSkiResorts } from "@/lib/skiResortData";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "スキー場マスター編集 | 管理画面",
};

export default async function ResortAdminPage() {
  await requireAdmin();
  const resorts = await readAdminSkiResorts();

  return <ResortAdminClient initialResorts={resorts} />;
}
