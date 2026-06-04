import { createWaitingTx, listWaitingTx } from "../controllers/waiting-tx.controller.js";
import { requireTimestampAuth } from "../middleware/auth.middleware.js";
import express from "express";

export default app => {
    var router = express.Router();

    router.post("/send", createWaitingTx);

    router.get("/list", requireTimestampAuth, listWaitingTx);

    app.use('/api/tx', router);
};