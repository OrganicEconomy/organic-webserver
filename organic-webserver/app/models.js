import { DB, USER, PASSWORD, HOST, dialect as _dialect, port as _port, pool as _pool } from "./config/db.config.js";

import Sequelize from "sequelize";

const sequelize = new Sequelize(DB, USER, PASSWORD, {
    host: HOST,
    dialect: _dialect,
    port: _port,
    operatorsAliases: false,

    pool: {
        max: _pool.max,
        min: _pool.min,
        acquire: _pool.acquire,
        idle: _pool.idle
    }
});

const User = sequelize.define("user", {
    publickey: {
        type: Sequelize.STRING(70),
        allowNull: false
    },
    name: {
        type: Sequelize.STRING,
        allowNull: false
    },
    mail: {
        type: Sequelize.STRING,
        allowNull: false
    },
    password: {
        type: Sequelize.STRING,
        allowNull: false
    },
    secretkey: {
        type: Sequelize.STRING,
        allowNull: false
    },
    blocks: {
        type: Sequelize.JSON,
        allowNull: false
    }
});

const UsedPaper = sequelize.define("usedpaper", {
    id: {
        type: Sequelize.STRING(70),
        primaryKey: true
    }
});

const WaitingTx = sequelize.define("waitingtx", {
    hash: {
        type: Sequelize.STRING,
        allowNull: false
    },
    tx: {
        type: Sequelize.JSON,
        allowNull: false
    }
});

export { User, UsedPaper, WaitingTx, sequelize }
