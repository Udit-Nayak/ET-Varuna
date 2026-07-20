import { Router } from "express";
import { askAgentChat } from "./controller";

const router = Router();

router.post("/ask", askAgentChat);

export default router;
