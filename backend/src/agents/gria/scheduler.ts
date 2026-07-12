import cron, { ScheduledTask } from "node-cron";
import { runPipeline } from "./service";

const SCHEDULE = "*/5 * * * *";

let schedulerInstance: ScheduledTask | null = null;
let running = false;

const log = (message: string, error?: unknown): void => {
  if (error) {
    console.error(`[GRIA Scheduler] ${message}`, error);
    return;
  }
  console.log(`[GRIA Scheduler] ${message}`);
};

export function startGriaScheduler(): ScheduledTask {
  if (schedulerInstance) {
    return schedulerInstance;
  }

  schedulerInstance = cron.schedule(SCHEDULE, async () => {
    if (running) {
      log("Previous run still in progress, skipping this tick");
      return;
    }

    running = true;
    try {
      log("Starting scheduled GRIA pipeline run");
      const result = await runPipeline({});
      log(`Completed scheduled run: ${JSON.stringify((result as { summary?: unknown })?.summary ?? {})}`);
    } catch (error) {
      log("Scheduled pipeline failed", error);
    } finally {
      running = false;
    }
  });

  log("Scheduler started");
  return schedulerInstance;
}

export function stopGriaScheduler(): void {
  schedulerInstance?.stop();
  schedulerInstance = null;
  running = false;
  log("Scheduler stopped");
}

export function isGriaSchedulerRunning(): boolean {
  return Boolean(schedulerInstance);
}

