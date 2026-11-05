import { Router } from "express";
import { postRegister, putSaveUser, putSignAndSaveUser, postLoginUser, postChangePassword } from "../controllers/user.controller.js";
import { requireRequestAuth } from "../middleware/auth.middleware.js";
import { exclusively } from "../utils/exclusive-run.util.js";

const router = Router();

router.post("/register", exclusively(postRegister));

router.put("/save", requireRequestAuth, exclusively(putSaveUser));

router.put("/sign", requireRequestAuth, exclusively(putSignAndSaveUser));

router.post("/login", postLoginUser);

router.post("/password", requireRequestAuth, postChangePassword);

export default router;
