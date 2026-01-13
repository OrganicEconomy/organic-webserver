import https from 'https';
import app from "./app.js";
import fs from 'fs';

const privateKey = fs.readFileSync('keys/server.key');
const certificate = fs.readFileSync('keys/server.cert');
const credentials = { key: privateKey, cert: certificate };

const PORT = process.env.NODE_DOCKER_PORT || 8080;

const httpsServer = https.createServer(credentials, app);

httpsServer.listen(PORT, () => {
    console.log(`Serveur HTTPS démarré sur le port ${PORT}!`);
});
