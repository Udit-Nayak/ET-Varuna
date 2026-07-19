import { Request, Response } from "express";
import { analyzeMapZone } from "./service";

export const analyzeZone = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await analyzeMapZone(req.body);
    res.status(200).json(result);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    res.status(400).json({ error: "Failed to analyze live-map zone", detail });
  }
};
