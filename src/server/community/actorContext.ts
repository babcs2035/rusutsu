import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

type CommunityActor = {
  userId: string | null;
  anonymousIdentity?: string;
};

// Established only after the internal API authenticates its server caller and
// resolves the Google account against the canonical database.
const actors = new AsyncLocalStorage<CommunityActor>();
export const internalCommunityActor = () => actors.getStore();
export const withInternalCommunityActor = <T>(
  actor: CommunityActor,
  task: () => Promise<T>,
) => actors.run(actor, task);
