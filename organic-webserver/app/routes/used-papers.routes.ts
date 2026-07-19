import { Router } from "express";
import { postCashPaper, getIsCashed } from "../controllers/used-paper.controller.js";

const router = Router();

router.post("/cash", postCashPaper);

router.get("/isCashed", getIsCashed);

export default router;
