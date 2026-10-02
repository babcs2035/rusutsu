import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

// Only the authenticated internal API establishes this context. A role supplied
// by the caller is never accepted; requireEditor re-reads this user's DB row.
const actors = new AsyncLocalStorage<string>();
export const internalEditActorId = () => actors.getStore();
export const withInternalEditActor = <T>(id: string, task: () => Promise<T>) =>
  actors.run(id, task);
