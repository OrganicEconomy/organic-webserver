import { getPublicKey } from "../controllers/used-paper.controller.js";
import express from "express";


export default app => {
    var router = express.Router();

    router.get("/", getPublicKey);

    app.use('/api/public-key', router);
};