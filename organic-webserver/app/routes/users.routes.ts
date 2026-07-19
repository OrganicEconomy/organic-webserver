import { Router } from "express";
import { postRegister, putSaveUser, putSignAndSaveUser, postLoginUser } from "../controllers/user.controller.js";
import { requireBlockAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/register", postRegister);

router.put("/save", requireBlockAuth, putSaveUser);

router.put("/sign", requireBlockAuth, putSignAndSaveUser);

router.post("/login", postLoginUser);

export default router;
