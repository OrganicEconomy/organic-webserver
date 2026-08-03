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
    },
    /**
     * 'active' by default so Phase 1 rows (all already open-genesis
     * validated) need no migration. A non-bootstrap registration (Phase 2)
     * creates the row as 'pending-validation' instead — see
     * user.controller.ts postRegister.
     */
    status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'active'
    }
});

/**
 * A cooperative/association (PROTOCOL.md §5.2b). Unlike a citizen's
 * secretkey, `ecosk` is decryptable by the server (see
 * app/utils/ecosystem-key.util.ts) — the server is this ecosystem's
 * custodian, signing on its behalf to execute payer orders and distribute
 * salaries. Creation is free and self-validating (§0.3 of Phase-2.md): there
 * is no 'pending-validation' status here, a row only ever exists once active.
 */
const Ecosystem = sequelize.define("ecosystem", {
    publickey: {
        type: Sequelize.STRING(70),
        allowNull: false,
        primaryKey: true,
    },
    name: {
        type: Sequelize.STRING,
        allowNull: false
    },
    blocks: {
        type: Sequelize.JSON,
        allowNull: false
    },
    /** Output of encryptEcosystemKey() — opaque JSON, never the plaintext key. */
    ecosk: {
        type: Sequelize.STRING,
        allowNull: false
    },
    /** True for exactly one ecosystem per server: the first one ever created on it. */
    iscore: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    lat: {
        type: Sequelize.FLOAT,
        allowNull: true
    },
    lng: {
        type: Sequelize.FLOAT,
        allowNull: true
    },
    description: {
        type: Sequelize.TEXT,
        allowNull: true
    },
    /** The founding citizen's public key — attribution metadata, not a cryptographic validator (the ecosystem self-validates). */
    validatorpk: {
        type: Sequelize.STRING(70),
        allowNull: false
    }
});

const UsedPaper = sequelize.define("usedpaper", {
    hash: {
        type: Sequelize.STRING(146),
        primaryKey: true,
    }
});

const WaitingTx = sequelize.define("waitingtx", {
    hash: {
        type: Sequelize.STRING(146),
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

export { User, Ecosystem, UsedPaper, WaitingTx, sequelize }
