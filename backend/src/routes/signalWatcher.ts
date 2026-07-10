import { Router, Request, Response } from "express";

const router = Router();
const SIGNAL_WATCHER_URL =
  process.env.SIGNAL_WATCHER_URL || "http://localhost:8001";

/**
 * Proxies the Python Signal Watcher service, which retrieves GDELT headlines
 * and attempts to extract article content from each result URL.
 */
router.get("/signal-watcher/:corridor", async (req: Request, res: Response) => {
  try {
    const corridor = encodeURIComponent(req.params.corridor);
    const response = await fetch(
      `${SIGNAL_WATCHER_URL}/signal-watcher/${corridor}`
    );

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (_error) {
    res.status(503).json({ error: "Signal Watcher service unavailable" });
  }
});

export default router;
