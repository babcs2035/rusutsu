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

  return (
    <main className="mx-auto min-h-[calc(100vh-64px)] max-w-[1440px] p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">
          スキー場マスター編集
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
          基本情報と公開状態を編集します。公開を停止してもスキー場や関連データは削除されず、管理画面には残ります。
        </p>
      </div>
      <ResortAdminClient initialResorts={resorts} />
    </main>
  );
}
