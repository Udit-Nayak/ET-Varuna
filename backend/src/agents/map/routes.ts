import { Router } from "express";
import { analyzeZone } from "./controller";

const router = Router();

router.post("/analyze-zone", analyzeZone);

export default router;
