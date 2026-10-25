import { notFound } from "next/navigation";
import { RelatedLinksEditor } from "@/features/corrections/RelatedLinksEditor";
import { safeCorrectionReturnTo } from "@/features/corrections/returnTo";
import { linksFromDocument } from "@/features/links/model";
import { prisma } from "@/lib/prisma";
import { getDataDocument } from "@/server/data-documents/client";
export default async function RelatedLinksPage({
  params,
  searchParams,
}: {
  params: Promise<{ resortId: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { resortId } = await params;
  const resort = await prisma.skiResort.findUnique({
    where: { id: resortId },
    select: { nameJa: true },
  });
  if (!resort) notFound();
  const document = await getDataDocument("SkiResortLinks.json");
  return (
    <RelatedLinksEditor
      resortId={resortId}
      returnTo={safeCorrectionReturnTo((await searchParams).returnTo, resortId)}
      resortName={resort.nameJa}
      current={linksFromDocument(document?.content ?? null)[resortId] ?? {}}
    />
  );
}
