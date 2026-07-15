import { Router, type Request, type Response } from "express";
import { getNationalState, getNationalStateHistory } from "./nationalStateRepository";

const router = Router();

router.get("/national-state/history", async (_req: Request, res: Response): Promise<void> => {
  try {
    const history = await getNationalStateHistory();
    res.status(200).json(history);
  } catch (error) {
    console.error("Failed to fetch national petroleum state history", error);
    res.status(500).json({ error: "Failed to fetch national petroleum state history" });
  }
});

router.get("/national-state", async (_req: Request, res: Response): Promise<void> => {
  try {
    const nationalState = await getNationalState();
    res.status(200).json(nationalState);
  } catch (error) {
    console.error("Failed to fetch national petroleum state", error);
    res.status(500).json({ error: "Failed to fetch national petroleum state" });
  }
});

export default router;
