import { postRegister, putSaveUser, putSignAndSaveUser, postLoginUser } from "../controllers/user.controller.js";
import express from "express";

export default app => {
    var router = express.Router();

    router.post("/register", postRegister);

    router.put("/save", putSaveUser);

    router.put("/sign", putSignAndSaveUser);

    router.post("/login", postLoginUser)

    app.use('/api/users', router);
};