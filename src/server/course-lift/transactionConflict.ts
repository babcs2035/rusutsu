// Prisma と PostgreSQL adapter が返す transaction 競合を判定する．
type ErrorRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is ErrorRecord =>
  typeof value === "object" && value !== null;

const isSerializationCode = (value: unknown): boolean =>
  value === "40001" || value === "40P01";

/** 表示用 message を解析せず，再試行可能な transaction 競合を判定する． */
export const isRetryableSummaryTransactionError = (error: unknown): boolean => {
  if (!isRecord(error)) return false;
  if (error.code === "P2034") return true;
  if (error.code !== "P2010" || !isRecord(error.meta)) return false;

  if (isSerializationCode(error.meta.code)) return true;

  const adapterError = error.meta.driverAdapterError;
  if (!isRecord(adapterError)) return false;
  if (isSerializationCode(adapterError.originalCode)) return true;
  if (isSerializationCode(adapterError.code)) return true;

  const cause = adapterError.cause;
  return (
    isRecord(cause) &&
    (isSerializationCode(cause.originalCode) || isSerializationCode(cause.code))
  );
};
