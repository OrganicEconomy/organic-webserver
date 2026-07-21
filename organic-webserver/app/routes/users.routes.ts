import { Router } from "express";
import { postRegister, putSaveUser, putSignAndSaveUser, postLoginUser, postChangePassword } from "../controllers/user.controller.js";
import { requireBlockAuth, requireTimestampAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/register", postRegister);

router.put("/save", requireBlockAuth, putSaveUser);

router.put("/sign", requireBlockAuth, putSignAndSaveUser);

router.post("/login", postLoginUser);

router.post("/password", requireTimestampAuth, postChangePassword);

export default router;
