import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

type CommunityActor = {
  userId: string | null;
  anonymousIdentity?: string;
  /** 修正投稿の再送を同じ申請として扱う、呼び出し元で作った識別子 */
  submissionKey?: string;
  /** ログインなしのリアクションの識別子（呼び出し元サーバーがCookieから作る） */
  reactionIdentity?: string;
};

// Established only after the internal API authenticates its server caller and
// resolves the Google account against the canonical database.
const actors = new AsyncLocalStorage<CommunityActor>();
export const internalCommunityActor = () => actors.getStore();
export const withInternalCommunityActor = <T>(
  actor: CommunityActor,
  task: () => Promise<T>,
) => actors.run(actor, task);
