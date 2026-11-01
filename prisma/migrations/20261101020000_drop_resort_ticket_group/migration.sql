-- 共通券グループを廃止した。一緒に見るスキー場は同時表示の組で扱い、
-- 共通券の相手はリフト券データの shared_with_resorts で持つ。
DROP INDEX IF EXISTS "ski_resorts_ticketGroupId_idx";
ALTER TABLE "ski_resorts" DROP COLUMN "ticketGroupId";
