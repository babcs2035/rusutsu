import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import type { Prisma } from "@prisma/client";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import { Pool } from "pg";
import type {
  ImportMarkerTransaction,
  OneTimeImportDatabase,
} from "../src/server/data-documents/initialization";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), ".env"), quiet: true });

export type CanonicalImportTransaction = ImportMarkerTransaction & {
  prisma: Prisma.TransactionClient;
};

export function readImportMode(args = process.argv.slice(2)) {
  const options = args.filter(argument => argument !== "--");
  if (
    options.length !== 1 ||
    !["--dry-run", "--initialize"].includes(options[0])
  ) {
    throw new Error(
      "Specify exactly --dry-run (no database access) or --initialize (one-time database write).",
    );
  }
  return options[0];
}

export async function withImportDatabase<T>(
  operation: (
    database: OneTimeImportDatabase<CanonicalImportTransaction>,
  ) => Promise<T>,
): Promise<T> {
  if (process.env.DATA_API_BASE_URL?.trim()) {
    throw new Error(
      "Direct DB imports require DATA_API_BASE_URL to be empty. Run imports in the canonical server environment.",
    );
  }
  const configured = process.env.DATABASE_URL;
  if (!configured) throw new Error("DATABASE_URL is required for --initialize");
  const pool = new Pool({
    connectionString: configured.replace(
      "$" + "{DB_PORT}",
      process.env.DB_PORT || "5432",
    ),
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    return await operation({
      transaction: (key, callback) =>
        prisma.$transaction(
          async transaction => {
            // Only imports take this advisory lock. Admin writes are preserved by
            // createMany(skipDuplicates) / null-only conditional updates below.
            await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
            return callback({
              prisma: transaction,
              getMarker: markerKey =>
                transaction.canonicalDataMigration.findUnique({
                  where: { key: markerKey },
                  select: { sourceHash: true },
                }),
              saveMarker: async (markerKey, sourceHash, details) => {
                await transaction.canonicalDataMigration.create({
                  data: { key: markerKey, sourceHash, details },
                });
              },
            });
          },
          { timeout: 300_000, maxWait: 30_000 },
        ),
    });
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}
