import { create, list } from "../controllers/waiting-tx.controller.js";
import express from "express";

export default app => {
    var router = express.Router();

    router.post("/send", create);

    router.get("/list", list);

    app.use('/api/tx', router);
};