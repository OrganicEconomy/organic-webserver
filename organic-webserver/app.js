import express from 'express';
import 'dotenv/config';
import { sequelize } from "./app/models.js";
import papersroutes from "./app/routes/used-papers.routes.js";
import usersroute from "./app/routes/users.routes.js";
import txroutes from "./app/routes/waiting-tx.routes.js";

const app = express();

app.use(express.json()); 

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", '*');
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    next();
});

try {
    await sequelize.sync()
    console.log("Synced db.");
} catch (err) {
    console.log("Failed to sync db: " + err.message);
}

papersroutes(app);
usersroute(app);
txroutes(app);

export default app;