import { Router } from "express";
import { context, mock, run, simulate } from "./controller";

const router = Router();

router.post("/simulate", simulate);
router.post("/run", run);
router.get("/context", context);
router.get("/context/:corridor", context);
router.get("/mock", mock);
router.get("/mock/:corridor", mock);

export default router;
