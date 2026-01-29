import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import { Pool } from "pg";

// 環境変数の読み込みを行う．
dotenv.config();

// データベース接続 URL の存在を確認する．
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// PostgreSQL への接続プールを作成する．
// Vercel Postgres を使用する場合，@prisma/adapter-pg を介して接続することで
// エッジ環境やサーバーレス環境での接続効率を向上させる．
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

// 開発環境において，ホットリロード発生時に複数の PrismaClient インスタンスが
// 生成されるのを防ぐため，グローバル変数にインスタンスをキャッシュする．
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/**
 * Prisma クライアントとデータベース接続プールを切断する．
 * クローリングスクリプトの終了時に呼び出し，プロセスが正常に終了できるようにする．
 */
export async function disconnectPrisma() {
  await prisma.$disconnect();
  await pool.end();
}
