import { Router } from "express";
import { getInfo, getServers } from "../controllers/info.controller.js";

const router = Router();

router.get("/info", getInfo);

router.get("/servers", getServers);

export default router;
