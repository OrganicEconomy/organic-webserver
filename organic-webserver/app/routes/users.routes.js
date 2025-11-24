import { create, update, signAndUpdate } from "../controllers/user.controller.js";
import express from "express";

export default app => {
    var router = express.Router();

    router.post("/register", create);

    router.put("/save", update);

    router.put("/sign", signAndUpdate);

    app.use('/api/users', router);
};