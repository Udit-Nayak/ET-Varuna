import { Request, Response } from "express";
import { getApoStatus, runApoRecommendation } from "./service";

const handleError = (res: Response, error: unknown, message: string): void => {
  const detail = error instanceof Error ? error.message : String(error);
  res.status(400).json({ error: message, detail });
};

export const recommend = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await runApoRecommendation(req.body ?? {});
    res.status(200).json(result);
  } catch (error) {
    handleError(res, error, "Failed to run APO procurement recommendation");
  }
};

export const status = async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await getApoStatus();
    res.status(200).json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch APO status");
  }
};
