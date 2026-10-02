import cron from "node-cron";
import { drainEditRequestJobs } from "./jobs";

const globalState = globalThis as unknown as {
  editRequestSchedulerStarted?: boolean;
};
export function startEditRequestJobScheduler() {
  if (
    globalState.editRequestSchedulerStarted ||
    process.env.DATA_API_BASE_URL?.trim() ||
    process.env.DISABLE_EDIT_REQUEST_JOBS === "true"
  )
    return;
  globalState.editRequestSchedulerStarted = true;
  const drain = () => {
    void drainEditRequestJobs().catch(() =>
      console.error("編集申請の標高ジョブを実行できませんでした。"),
    );
  };
  cron.schedule("* * * * *", drain);
  drain();
}
