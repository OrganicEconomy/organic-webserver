/**
 * Plain HTTP by default: TLS termination belongs to the reverse proxy placed
 * in front (Caddy — see the organic-deploy repository), not to Node.
 *
 * Set SSL_CERT_PATH/SSL_KEY_PATH to switch to HTTPS instead — dev-only, so a
 * phone on the same LAN gets a secure context (camera/QR scanning requires
 * one; a plain http:// origin silently disables it).
 */
import { readFileSync } from "node:fs";
import { createServer as createHttpsServer } from "node:https";
import app from "./app.js";

const PORT = Number(process.env.NODE_DOCKER_PORT || process.env.NODE_LOCAL_PORT || 8080);

const sslCertPath = process.env.SSL_CERT_PATH;
const sslKeyPath = process.env.SSL_KEY_PATH;

if (sslCertPath && sslKeyPath) {
    const options = { cert: readFileSync(sslCertPath), key: readFileSync(sslKeyPath) };
    createHttpsServer(options, app).listen(PORT, () => {
        console.log(`Organic server listening on port ${PORT} (HTTPS)`);
    });
} else {
    app.listen(PORT, () => {
        console.log(`Organic server listening on port ${PORT}`);
    });
}
