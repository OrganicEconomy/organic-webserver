import { Router } from "express";
import { postRegister, putSaveUser, putSignAndSaveUser, postLoginUser, postChangePassword } from "../controllers/user.controller.js";
import { requireBlockAuth, requireTimestampAuth } from "../middleware/auth.middleware.js";
import { exclusively } from "../utils/exclusive-run.util.js";

const router = Router();

router.post("/register", exclusively(postRegister));

router.put("/save", requireBlockAuth, exclusively(putSaveUser));

router.put("/sign", requireBlockAuth, exclusively(putSignAndSaveUser));

router.post("/login", postLoginUser);

router.post("/password", requireTimestampAuth, postChangePassword);

export default router;
