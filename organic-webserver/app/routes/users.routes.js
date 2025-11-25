import { createUser, saveUser, signAndSaveUser } from "../controllers/user.controller.js";
import express from "express";

export default app => {
    var router = express.Router();

    router.post("/register", createUser);

    router.put("/save", saveUser);

    router.put("/sign", signAndSaveUser);

    app.use('/api/users', router);
};