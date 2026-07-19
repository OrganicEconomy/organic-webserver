import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { sequelize } from "./app/models.js";
import papersRouter from "./app/routes/used-papers.routes.js";
import usersRouter from "./app/routes/users.routes.js";
import txRouter from "./app/routes/waiting-tx.routes.js";
import infoRouter from "./app/routes/info.routes.js";

if (!process.env.ORGANIC_SECRET_KEY) {
    throw new Error('Missing ORGANIC_SECRET_KEY environment variable');
}

const corsOptions = {
    origin: ['http://localhost:4200'],
    methods: ['GET', 'POST', 'PUT'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    optionsSuccessStatus: 200
};

const isTest = process.env.NODE_ENV === 'test'

const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 8,
    skip: () => isTest,
    standardHeaders: true,
    legacyHeaders: false,
})

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    skip: () => isTest,
    standardHeaders: true,
    legacyHeaders: false,
})

const app = express();

app.use(express.json());
app.use(cors(corsOptions))

try {
    await sequelize.sync()
    console.log("Synced db.");
} catch (err) {
    console.log("Failed to sync db: " + (err as Error).message);
}

// The '/api' prefix also rate-limits '/api/v1/*'.
app.use(['/api/v1/users/login', '/api/users/login'], loginLimiter)
app.use('/api', apiLimiter)

// One API, two mounts: /api/v1 is the standard (PROTOCOL.md §5); the bare
// /api alias keeps legacy clients alive during Phase 1 and dies with it.
const api = express.Router()
api.use(infoRouter)
api.use('/users', usersRouter)
api.use('/tx', txRouter)
api.use('/papers', papersRouter)

app.use('/api/v1', api)
app.use('/api', api)

export default app;
