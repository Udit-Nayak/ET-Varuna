import { Router } from "express";
import { optimize, status } from "./controller";

const router = Router();

router.post("/optimize", optimize);
router.post("/from-dsm", optimize);
router.get("/status", status);

export default router;
