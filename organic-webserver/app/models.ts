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
    },
    /** ISO date of birth ("1990-03-15"), as declared at register. */
    birthdate: {
        type: Sequelize.DATEONLY,
        allowNull: true
    },
    /** Public key of the referent that validated this account (this server's, in Phase 1's open genesis). */
    validatorpk: {
        type: Sequelize.STRING(70),
        allowNull: true
    },
    /**
     * Opaque token identifying the currently active device (crypto.randomUUID()).
     * Issued at register/login; rotated on every login, revoking the previous one.
     * Not cryptographic — identity is still proven by x-signature (PROTOCOL.md §5.4).
     */
    devicetoken: {
        type: Sequelize.STRING,
        allowNull: true
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
