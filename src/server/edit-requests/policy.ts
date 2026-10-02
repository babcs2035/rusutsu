import { canEdit } from "@/lib/roles";

export class EditConflictError extends Error {
  constructor() {
    super(
      "申請後にデータまたは申請状態が更新されました。最新の内容を確認してください。",
    );
  }
}
export class CanonicalEditConflictError extends EditConflictError {}

export function assertCanReadRequest(
  actor: { id: string; role: string },
  request: { authorId: string },
) {
  if (
    !canEdit(actor.role) ||
    (actor.role !== "admin" && actor.id !== request.authorId)
  )
    throw new Error("申請が見つからないか、アクセス権限がありません。");
}
export function assertPendingVersion(
  request: { status: string; version: number } | null,
  version: number,
) {
  if (request?.status !== "PENDING" || request.version !== version)
    throw new EditConflictError();
}
export function assertReviewActors(
  admin: { role: string } | null,
  author: { role: string } | null,
) {
  if (admin?.role !== "admin") throw new Error("管理者権限が必要です。");
  if (!author || !canEdit(author.role))
    throw new Error("申請者が削除または降格されているため反映できません。");
}
