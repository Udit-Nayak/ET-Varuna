import { Router, type Request, type Response } from "express";
import { getLivePriceSnapshot, updateLivePriceSnapshot } from "./livePriceRepository";

const router = Router();

router.get("/live-price", async (_req: Request, res: Response): Promise<void> => {
  try {
    res.status(200).json(await getLivePriceSnapshot());
  } catch (error) {
    console.error("Failed to fetch live price snapshot", error);
    res.status(500).json({ error: "Failed to fetch live price snapshot" });
  }
});

router.post("/live-price/refresh", async (_req: Request, res: Response): Promise<void> => {
  try {
    res.status(200).json(await updateLivePriceSnapshot());
  } catch (error) {
    console.error("Failed to refresh live price snapshot", error);
    res.status(500).json({ error: "Failed to refresh live price snapshot" });
  }
});

export default router;
