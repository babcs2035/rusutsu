import { AsyncLocalStorage } from "node:async_hooks";

// Set only after checking the administrator's current DB role and an explicit
// overwrite choice. Keep dependency-free like capture.ts for isolated tests.
const adminOverwrites = new AsyncLocalStorage<boolean>();
export const allowsAdminOverwrite = () => adminOverwrites.getStore() === true;
export const withAdminOverwrite = <T>(task: () => Promise<T>) =>
  adminOverwrites.run(true, task);
