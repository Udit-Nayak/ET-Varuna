import { Request, Response } from "express";
import { getSroaStatus, runSroaOptimization } from "./service";

const handleError = (res: Response, error: unknown, message: string): void => {
  const detail = error instanceof Error ? error.message : String(error);
  res.status(400).json({ error: message, detail });
};

export const optimize = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await runSroaOptimization(req.body);
    res.status(200).json(result);
  } catch (error) {
    handleError(res, error, "Failed to run SROA optimization");
  }
};

export const status = async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await getSroaStatus();
    res.status(200).json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch SROA operational data");
  }
};
