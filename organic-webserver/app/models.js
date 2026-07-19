import Sequelize from "sequelize";
import { sequelize } from "./config/db.config.js";

const User = sequelize.define("user", {
    publickey: {
        type: Sequelize.STRING(70),
        allowNull: false,
        primaryKey: true,
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
    hash: {
        type: Sequelize.STRING(141),
        primaryKey: true,
    }
});

const WaitingTx = sequelize.define("waitingtx", {
    hash: {
        type: Sequelize.STRING(141),
        allowNull: false,
        primaryKey: true
    },
    target: {
        type: Sequelize.STRING,
        allowNull: false
    },
    tx: {
        type: Sequelize.JSON,
        allowNull: false
    }
});

export { User, UsedPaper, WaitingTx, sequelize }
