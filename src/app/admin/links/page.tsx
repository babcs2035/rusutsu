import type { Metadata } from "next";
import { LinksAdminClient } from "@/features/links/LinksAdminClient";
import { linksFromDocument } from "@/features/links/model";
import { getResortSearchName } from "@/lib/resortAliases";
import { readAdminSkiResorts } from "@/lib/skiResortData";
import { getDataDocument } from "@/server/data-documents/client";
import { requireEditingPage } from "@/server/edit-requests/authPages";
import { isMergedSource } from "@/server/ski-resorts/adminContract";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "リンク編集 | 管理画面" };

export default async function LinksAdminPage() {
  await requireEditingPage();
  const [resorts, document] = await Promise.all([
    readAdminSkiResorts(),
    getDataDocument("SkiResortLinks.json"),
  ]);
  return (
    <LinksAdminClient
      resorts={resorts
        .filter(resort => !isMergedSource(resort, resorts))
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
      initialLinks={linksFromDocument(document?.content ?? null)}
    />
  );
}
