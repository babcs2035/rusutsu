import type { Metadata } from "next";
import { socialLinksFromDocument } from "@/features/social/model";
import { SocialAdminClient } from "@/features/social/SocialAdminClient";
import { requireAdmin } from "@/lib/requireAdmin";
import { getResortSearchName } from "@/lib/resortAliases";
import { readAdminSkiResorts } from "@/lib/skiResortData";
import { getDataDocument } from "@/server/data-documents/client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "SNSリンク編集 | 管理画面" };

export default async function SocialAdminPage() {
  await requireAdmin();
  const [resorts, document] = await Promise.all([
    readAdminSkiResorts(),
    getDataDocument("SkiResortLinks.json"),
  ]);
  return (
    <SocialAdminClient
      resorts={resorts
        .filter(resort => resort.mergedIntoId === null)
        .map(resort => ({
          id: resort.id,
          name: resort.nameJa,
          prefecture: resort.prefecture,
          searchName: getResortSearchName(
            resort.id,
            resort.nameJa,
            resort.shortName,
          ),
        }))}
      initialLinks={socialLinksFromDocument(document?.content ?? null)}
    />
  );
}
