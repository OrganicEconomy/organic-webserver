import { postRegister, putSaveUser, putSignAndSaveUser, getLoginUser } from "../controllers/user.controller.js";
import express from "express";

export default app => {
    var router = express.Router();

    router.post("/register", postRegister);

    router.put("/save", putSaveUser);

    router.put("/sign", putSignAndSaveUser);

    router.get("/login", getLoginUser)

    app.use('/api/users', router);
};