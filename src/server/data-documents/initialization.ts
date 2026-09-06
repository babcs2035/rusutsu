/** Keep these keys stable. Deleting a document never removes its import marker. */
export const DATA_DOCUMENT_INITIALIZATION_KEY = "canonical-documents-v1";
export const SHORT_NAME_INITIALIZATION_KEY = "ski-resort-short-names-v1";

export type ImportMarker = { sourceHash: string };
export interface ImportMarkerTransaction {
  getMarker(key: string): Promise<ImportMarker | null>;
  saveMarker(
    key: string,
    sourceHash: string,
    details: Record<string, number>,
  ): Promise<void>;
}

export interface OneTimeImportDatabase<T extends ImportMarkerTransaction> {
  /** Serialize imports sharing a key and roll back operation + marker together. */
  transaction<R>(
    key: string,
    operation: (transaction: T) => Promise<R>,
  ): Promise<R>;
}

export async function runOneTimeImport<T extends ImportMarkerTransaction>(
  database: OneTimeImportDatabase<T>,
  key: string,
  sourceHash: string,
  operation: (transaction: T) => Promise<Record<string, number>>,
) {
  return database.transaction(key, async transaction => {
    const completed = await transaction.getMarker(key);
    if (completed) {
      return {
        status: "already_completed" as const,
        sourceHash: completed.sourceHash,
      };
    }
    const details = await operation(transaction);
    await transaction.saveMarker(key, sourceHash, details);
    return { status: "completed" as const, sourceHash, details };
  });
}

/** Fixtures are opt-in for an uninitialized development DB only. */
export function canUseBundledFixtures(
  environment: {
    NODE_ENV?: string;
    DATA_DOCUMENT_ALLOW_BUNDLED_FIXTURES?: string;
  },
  initializationCompleted: boolean,
) {
  return (
    environment.NODE_ENV !== "production" &&
    environment.DATA_DOCUMENT_ALLOW_BUNDLED_FIXTURES === "true" &&
    !initializationCompleted
  );
}
