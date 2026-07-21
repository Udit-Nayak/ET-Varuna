import { Router } from "express";
import { verifyFirebaseToken } from "../../middleware/verifyFirebaseToken";
import {
  askAgentChat,
  askAgentOutputQuestionController,
  askDirectChatbot,
  createChatSession,
  deleteChatSession,
  formatAgentOutputController,
  getChatSession,
  listChatSessions,
  updateChatSession,
} from "./controller";

const router = Router();

router.use(verifyFirebaseToken);

router.post("/direct", askDirectChatbot);
router.post("/ask", askAgentChat);
router.post("/format-agent-output", formatAgentOutputController);
router.get("/sessions", listChatSessions);
router.post("/sessions", createChatSession);
router.get("/sessions/:id", getChatSession);
router.patch("/sessions/:id", updateChatSession);
router.delete("/sessions/:id", deleteChatSession);
router.post("/ask-agent-output", askAgentOutputQuestionController);

export default router;
