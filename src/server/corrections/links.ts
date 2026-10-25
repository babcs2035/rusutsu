import {
  LINK_CATEGORIES,
  type LinkKey,
  linkSaveSchema,
  linksFromDocument,
} from "@/features/links/model";
export function correctionLinkPlatform(field: string): LinkKey | null {
  const key = field.startsWith("links:") ? field.slice(6) : "";
  return LINK_CATEGORIES.find(category => category.key === key)?.key ?? null;
}
export function correctionLinks(
  content: string | null,
  resortId: string,
  field: string,
) {
  const platform = correctionLinkPlatform(field);
  if (!platform) throw new Error("対象のリンクを確認してください。");
  return linksFromDocument(content)[resortId]?.[platform] ?? [];
}
export function validateCorrectionLinks(
  resortId: string,
  field: string,
  links: unknown,
  before: unknown = [],
) {
  return linkSaveSchema.parse({
    resortId,
    platform: correctionLinkPlatform(field),
    links,
    expectedLinks: before,
  });
}
