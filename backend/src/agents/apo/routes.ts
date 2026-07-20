import { Router } from "express";
import { recommend, status } from "./controller";

const router = Router();

router.post("/recommendation", recommend);
router.post("/procurement-recommendation", recommend);
router.get("/status", status);

export default router;
