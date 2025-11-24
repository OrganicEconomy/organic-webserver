import { create } from "../controllers/used-paper.controller.js";
import express from "express";


export default app => {
    var router = express.Router();

    router.post("/add", create);

    app.use('/api/papers', router);
};