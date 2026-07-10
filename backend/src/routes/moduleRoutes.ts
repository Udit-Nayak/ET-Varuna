import { Router, Request, Response } from "express";
import { runApo, runDsm, runGria, runSroa, runTfm } from "../modules/logic";
import { mockScdt } from "../modules/mockData";

const router = Router();

router.get("/gria", (_req: Request, res: Response) => {
  res.json(runGria({ corridor: "Red Sea / Bab-el-Mandeb", risk_score: 78 }));
});

router.post("/gria", (req: Request, res: Response) => {
  const { corridor, risk_score } = req.body;
  res.json(runGria({ corridor, risk_score }));
});

router.post("/dsm", (req: Request, res: Response) => {
  const { corridor, capacity_loss_pct, duration_days } = req.body;
  res.json(runDsm({ corridor, capacity_loss_pct, duration_days }));
});

router.post("/apo", (req: Request, res: Response) => {
  const { corridor, supply_gap_volume, urgency } = req.body;
  res.json(runApo({ corridor, supply_gap_volume, urgency }));
});

router.post("/sroa", (req: Request, res: Response) => {
  const { current_reserve_days, forecast_gap } = req.body;
  res.json(runSroa({ current_reserve_days, forecast_gap }));
});

router.post("/tfm", (req: Request, res: Response) => {
  const { corridor, baseline_volume, current_volume, price_delta_pct } = req.body;
  res.json(runTfm({ corridor, baseline_volume, current_volume, price_delta_pct }));
});

router.get("/scdt", (_req: Request, res: Response) => {
  res.json(mockScdt);
});

router.get("/status", (_req: Request, res: Response) => {
  const gria = runGria({ corridor: "Red Sea / Bab-el-Mandeb", risk_score: 78 });
  const dsm = runDsm({ corridor: gria.corridor, capacity_loss_pct: 22, duration_days: 14 });
  const apo = runApo({ corridor: gria.corridor, supply_gap_volume: 1800000, urgency: 8 });
  const sroa = runSroa({ current_reserve_days: 12, forecast_gap: dsm.impact_timeline });
  const tfm = runTfm({ corridor: gria.corridor, baseline_volume: 240000, current_volume: 151200, price_delta_pct: 8.4 });

  res.json({
    corridor: gria.corridor,
    gria,
    dsm,
    apo,
    sroa,
    tfm,
    scdt: mockScdt,
    status: gria.risk_score >= 70 ? "alert" : "monitoring",
  });
});

export default router;
