-- シーズン券・キッズパスなど（NSDキッズプログラム・マックアース・スノーバーズクラブ）の対象スキー場一覧。
-- 絞り込みに使う。一覧から消えた行は removedAt を付けて残す。
CREATE TABLE "pass_program_resorts" (
    "id" TEXT NOT NULL,
    "programId" VARCHAR(30) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "url" TEXT,
    "prefecture" VARCHAR(20),
    "skiResortId" TEXT,
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMPTZ(3),

    CONSTRAINT "pass_program_resorts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pass_program_resorts_programId_name_key" ON "pass_program_resorts"("programId", "name");

CREATE INDEX "pass_program_resorts_skiResortId_idx" ON "pass_program_resorts"("skiResortId");

ALTER TABLE "pass_program_resorts" ADD CONSTRAINT "pass_program_resorts_skiResortId_fkey" FOREIGN KEY ("skiResortId") REFERENCES "ski_resorts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
