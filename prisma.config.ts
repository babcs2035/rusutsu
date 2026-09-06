import { defineConfig, env } from "@prisma/config";
import "dotenv/config";

export default defineConfig({
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
