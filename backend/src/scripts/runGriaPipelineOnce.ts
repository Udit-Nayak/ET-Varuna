import dotenv from "dotenv";
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { runPipeline } from "../agents/gria/service";

dotenv.config();

const getArgValue = (name: string, fallback: number): number => {
  const raw = process.argv.find((arg) => arg.startsWith(`${name}=`))?.split("=")[1];
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const main = async (): Promise<void> => {
  const limit = getArgValue("--limit", 25);
  await connectDB();
  const result = await runPipeline({ limit });
  console.log(JSON.stringify(result, null, 2));
};

main()
  .catch((error) => {
    console.error("[GRIA run once] FAILED", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
