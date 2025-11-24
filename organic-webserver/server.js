import express from 'express';
import fs from 'fs';
import https from 'https';
import 'dotenv/config';
import db from "./app/models/index.js";
import papersroutes from "./app/routes/used-papers.routes.js";
import usersroute from "./app/routes/users.routes.js";
import txroutes from "./app/routes/waiting-tx.routes.js";

const privateKey = fs.readFileSync('keys/server.key');
const certificate = fs.readFileSync('keys/server.cert');
const credentials = { key: privateKey, cert: certificate };

const app = express();
const PORT = process.env.NODE_DOCKER_PORT || 8080;

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", '*');
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    next();
});

db.sequelize.sync()
    .then(() => {
        console.log("Synced db.");
    })
    .catch((err) => {
        console.log("Failed to sync db: " + err.message);
    });


const httpsServer = https.createServer(credentials, app);

papersroutes(app);
usersroute(app);
txroutes(app);

httpsServer.listen(PORT, () => {
    console.log(`Serveur HTTPS démarré sur le port ${PORT}!`);
});
