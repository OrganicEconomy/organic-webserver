import { Router } from "express";
import { createWaitingTx, listWaitingTx, verifyTx } from "../controllers/waiting-tx.controller.js";
import { requireTimestampAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/send", createWaitingTx);

router.get("/list", requireTimestampAuth, listWaitingTx);

router.post("/verify", verifyTx);

export default router;
