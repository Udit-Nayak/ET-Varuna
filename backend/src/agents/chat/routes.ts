import { Router } from "express";
import { askAgentChat, formatAgentOutputController } from "./controller";

const router = Router();

router.post("/ask", askAgentChat);
router.post("/format-agent-output", formatAgentOutputController);

export default router;
