import { runPipeline } from "./service";

const SCHEDULE_MS = Math.max(5, Number(process.env.GRIA_NEWS_CRON_MINUTES ?? 35)) * 60 * 1000;

let schedulerInstance: NodeJS.Timeout | null = null;
let running = false;

const log = (message: string, error?: unknown): void => {
  if (error) {
    console.error(`[GRIA Scheduler] ${message}`, error);
    return;
  }
  console.log(`[GRIA Scheduler] ${message}`);
};

export function startGriaScheduler(): NodeJS.Timeout {
  if (schedulerInstance) {
    return schedulerInstance;
  }

  const tick = async (): Promise<void> => {
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
  };

  void tick();
  schedulerInstance = setInterval(() => {
    void tick();
  }, SCHEDULE_MS);

  log("Scheduler started");
  return schedulerInstance;
}

export function stopGriaScheduler(): void {
  if (schedulerInstance) {
    clearInterval(schedulerInstance);
  }
  schedulerInstance = null;
  running = false;
  log("Scheduler stopped");
}

export function isGriaSchedulerRunning(): boolean {
  return Boolean(schedulerInstance);
}
