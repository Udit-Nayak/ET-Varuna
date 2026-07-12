declare module "node-cron" {
  export interface ScheduledTask {
    stop(): void;
    start(): void;
    destroy(): void;
  }

  export function schedule(expression: string, task: () => void | Promise<void>): ScheduledTask;

  const cron: {
    schedule: typeof schedule;
  };

  export default cron;
}

