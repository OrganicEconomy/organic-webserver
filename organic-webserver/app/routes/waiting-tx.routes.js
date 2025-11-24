import { create } from "../controllers/waiting-tx.controller.js";
import express from "express";

export default app => {
    var router = express.Router();

    router.post("/send", create);

    app.use('/api/tx', router);
};