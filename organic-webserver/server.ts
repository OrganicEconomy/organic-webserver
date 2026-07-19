/**
 * Plain HTTP on purpose: TLS termination belongs to the reverse proxy placed
 * in front (Caddy — see the organic-deploy repository), not to Node.
 */
import app from "./app.js";

const PORT = Number(process.env.NODE_DOCKER_PORT || process.env.NODE_LOCAL_PORT || 8080);

app.listen(PORT, () => {
    console.log(`Organic server listening on port ${PORT}`);
});
