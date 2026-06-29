import express from "express";
import { AgentController } from "../controllers/agent.controller";
import { asyncHandler } from "../utils/asyncHandler";

const router = express.Router();
const agentController = new AgentController();

router.get(
  "/agents",
  asyncHandler(agentController.getAll.bind(agentController)),
);
router.post(
  "/agents",
  asyncHandler(agentController.create.bind(agentController)),
);
router.put(
  "/agents/:id",
  asyncHandler(agentController.update.bind(agentController)),
);
router.delete(
  "/agents/:id",
  asyncHandler(agentController.delete.bind(agentController)),
);

export default router;
