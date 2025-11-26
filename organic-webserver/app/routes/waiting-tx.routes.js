import { createWaitingTx, listWaitingTx } from "../controllers/waiting-tx.controller.js";
import express from "express";

export default app => {
    var router = express.Router();

    router.post("/send", createWaitingTx);

    router.get("/list", listWaitingTx);

    app.use('/api/tx', router);
};