import { cashPaper, isItUsed } from "../controllers/used-paper.controller.js";
import express from "express";


export default app => {
    var router = express.Router();

    router.post("/cash", cashPaper);
    
    router.get("/isCashed", isItUsed);

    app.use('/api/papers', router);
};