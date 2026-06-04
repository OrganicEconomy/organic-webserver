import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import rateLimit from 'express-rate-limit';
import { sequelize } from "./app/models.js";
import papersroutes from "./app/routes/used-papers.routes.js";
import usersroute from "./app/routes/users.routes.js";
import txroutes from "./app/routes/waiting-tx.routes.js";

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
    console.log("Failed to sync db: " + err.message);
}

app.use('/api/users/login', loginLimiter)
app.use('/api', apiLimiter)

papersroutes(app);
usersroute(app);
txroutes(app);

export default app;