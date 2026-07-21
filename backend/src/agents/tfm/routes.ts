import { Router, type Request, type Response } from "express";
import { getTfmLiveSnapshot } from "./service";

const router = Router();

router.get("/live", async (_req: Request, res: Response): Promise<void> => {
  try {
    res.status(200).json(await getTfmLiveSnapshot());
  } catch (error) {
    console.error("Failed to fetch TFM live snapshot", error);
    res.status(500).json({ error: "Failed to fetch TFM live snapshot", detail: error instanceof Error ? error.message : String(error) });
  }
});

export default router;
