import "server-only";
import { saveResortLink } from "@/features/links/actions";
import { type LinkSaveRequest, linkSaveSchema } from "@/features/links/model";
export async function saveRelatedEditorLinks(
  resortId: string,
  requests: LinkSaveRequest[] = [],
) {
  if (requests.length > 20) throw new Error("リンクの件数が多すぎます。");
  const parsed = requests.map(request => linkSaveSchema.parse(request));
  if (parsed.some(request => request.resortId !== resortId))
    throw new Error("リンクの対象が申請と一致していません。");
  for (const request of parsed) {
    const result = await saveResortLink(request);
    if (!result.ok) throw new Error(result.message);
  }
}
