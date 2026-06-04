import { postRegister, putSaveUser, putSignAndSaveUser, postLoginUser } from "../controllers/user.controller.js";
import { requireBlockAuth } from "../middleware/auth.middleware.js";
import express from "express";

export default app => {
    var router = express.Router();

    router.post("/register", postRegister);

    router.put("/save", requireBlockAuth, putSaveUser);

    router.put("/sign", requireBlockAuth, putSignAndSaveUser);

    router.post("/login", postLoginUser)

    app.use('/api/users', router);
};