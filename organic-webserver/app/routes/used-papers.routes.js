import { postCashPaper, getIsCashed } from "../controllers/used-paper.controller.js";
import express from "express";


export default app => {
    var router = express.Router();

    router.post("/cash", postCashPaper);
    
    router.get("/isCashed", getIsCashed);

    app.use('/api/papers', router);
};