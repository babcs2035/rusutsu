-- 連携エリア（LINKED）を廃止した。結合は完全統合だけになり、各スキー場は自分のデータを持つ。
ALTER TABLE "ski_resorts" DROP CONSTRAINT IF EXISTS "ski_resorts_linkKind_check";
ALTER TABLE "ski_resorts" DROP COLUMN "linkKind";
