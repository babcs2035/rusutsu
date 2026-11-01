import type { Metadata } from "next";
import Link from "next/link";
import { DisplayGroupList } from "@/features/resort/DisplayGroupList";
import { readDisplayGroups } from "@/lib/resortDisplayGroups";
import { readAdminSkiResorts } from "@/lib/skiResortData";
import { requireEditingPage } from "@/server/edit-requests/authPages";
import type { AdminSkiResortRecord } from "@/server/ski-resorts/adminContract";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "スキー場の関係一覧 | 管理画面",
};

type Resort = Pick<AdminSkiResortRecord, "id" | "nameJa" | "isActive">;

function ResortLink({ resort }: { resort: Resort }) {
  return (
    <Link
      href={`/admin/resort?id=${encodeURIComponent(resort.id)}`}
      className="underline decoration-gray-300 underline-offset-2 hover:decoration-current"
    >
      {resort.nameJa}
      {!resort.isActive && (
        <span className="ml-1 text-xs text-gray-500">（公開停止中）</span>
      )}
    </Link>
  );
}

function ResortList({ resorts }: { resorts: Resort[] }) {
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1">
      {resorts.map(resort => (
        <ResortLink key={resort.id} resort={resort} />
      ))}
    </span>
  );
}

function Section({
  title,
  description,
  count,
  children,
}: {
  title: string;
  description: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-bold text-gray-900 font-[var(--font-heading)]">
        {title}
        <span className="ml-2 text-sm font-normal text-gray-500">
          {count}件
        </span>
      </h2>
      <p className="text-sm text-gray-600">{description}</p>
      {count ? (
        <ul className="divide-y rounded-lg border bg-white">{children}</ul>
      ) : (
        <p className="rounded-lg border bg-white p-4 text-sm text-gray-500">
          まだありません。
        </p>
      )}
    </section>
  );
}

/** 完全統合・共通券・同時表示の組を一覧で見る。各スキー場の設定はスキー場マスター編集で変える */
export default async function ResortRelationsPage() {
  await requireEditingPage();
  const [resorts, displayGroups] = await Promise.all([
    readAdminSkiResorts(),
    readDisplayGroups(),
  ]);
  const byId = new Map(resorts.map(resort => [resort.id, resort]));
  const resortOf = (id: string): Resort =>
    byId.get(id) ?? { id, nameJa: id, isActive: false };
  const byName = (left: Resort, right: Resort) =>
    left.nameJa.localeCompare(right.nameJa, "ja");

  const merged = resorts
    .filter(resort => resort.sourceResortIds.length && resort.isActive)
    .sort(byName);

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-4 md:p-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-gray-900 font-[var(--font-heading)]">
          スキー場の関係一覧
        </h1>
        <p className="text-sm text-gray-600">
          名前を押すと、そのスキー場のマスター編集を開きます。完全統合はマスター編集の「複数のスキー場を結合」から、同時表示の組はこのページかマスター編集から追加します。
        </p>
      </div>

      <Section
        title="完全統合"
        description="複数のスキー場を1件にまとめて公開しています。結合元は一般画面に出ません。"
        count={merged.length}
      >
        {merged.map(parent => (
          <li key={parent.id} className="space-y-1 p-3 text-sm">
            <p className="font-bold">
              <ResortLink resort={parent} />
            </p>
            <p className="text-gray-600">
              結合元：
              <ResortList resorts={parent.sourceResortIds.map(resortOf)} />
            </p>
          </li>
        ))}
      </Section>

      <DisplayGroupList initialGroups={displayGroups} resorts={resorts} />
    </main>
  );
}
