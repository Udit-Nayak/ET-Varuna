import { initGriaIndexes } from "./mongoRepository";
import { isGriaSchedulerRunning, startGriaScheduler } from "./scheduler";

export const validateGriaEnvironment = (): void => {
  const required = ["HF_TOKEN"];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing GRIA environment variables: ${missing.join(", ")}`);
  }
};

export const bootstrapGria = async (): Promise<void> => {
  validateGriaEnvironment();
  await initGriaIndexes();

  if (!isGriaSchedulerRunning()) {
    startGriaScheduler();
  }
};
