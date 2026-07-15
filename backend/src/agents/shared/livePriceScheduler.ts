import cron, { type ScheduledTask } from "node-cron";
import { updateLivePriceSnapshot } from "./livePriceRepository";

let scheduler: ScheduledTask | null = null;
let refreshInProgress = false;

export function startLivePriceScheduler(): ScheduledTask {
  if (scheduler) return scheduler;

  scheduler = cron.schedule("0 * * * *", async () => {
    if (refreshInProgress) return;
    refreshInProgress = true;
    try {
      await updateLivePriceSnapshot();
      console.log("[Live Price Scheduler] PPAC snapshot refreshed");
    } catch (error) {
      console.error("[Live Price Scheduler] PPAC snapshot refresh failed", error);
    } finally {
      refreshInProgress = false;
    }
  });

  console.log("[Live Price Scheduler] Hourly scheduler started");
  return scheduler;
}

export function stopLivePriceScheduler(): void {
  scheduler?.stop();
  scheduler = null;
  refreshInProgress = false;
}
