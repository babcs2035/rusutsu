// シードスクリプト - DB接続確認用のプレースホルダー。
// Git同梱JSON/GeoJSONの初回投入は importCanonicalDataDocuments.ts が担う。

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config({ quiet: true });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run the seed script.");
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seed script executed.");
  console.log("📝 This seed only ensures the schema is in place.");
  console.log("📦 Canonical documents are imported by the separate import task.");

  // DB 接続確認のみ
  const count = await prisma.skiResort.count();
  console.log(`✅ Database connected. Current ski resorts: ${count}`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
