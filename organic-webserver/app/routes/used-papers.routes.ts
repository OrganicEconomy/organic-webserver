import { Router } from "express";
import { getIsCashed } from "../controllers/used-paper.controller.js";

const router = Router();

router.get("/isCashed", getIsCashed);

export default router;
