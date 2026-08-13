import type { Request, Response } from 'express'
import { randomUUID } from 'node:crypto'
import { User, Ecosystem, WaitingTx } from "../models.js"
import { Op } from 'sequelize'
import bcrypt from 'bcryptjs'
import type { BlockWire, MembershipStatus } from 'organic-protocol'
import { publicFromPrivate, EcosystemBlockchain } from 'organic-money/src/index.js'

import { validateBlockchain, assertWaitingValidation, updateLastBlock, signLastBlock } from '../services/blockchain.service.js'
import { encryptEcosystemKey } from '../utils/ecosystem-key.util.js'
import { sendError } from '../utils/api-error.js'

const SECRETKEY = process.env.ORGANIC_SECRET_KEY as string

export async function postLoginUser(req: Request, res: Response): Promise<void> {
    if (!req.body || !req.body.mail || !req.body.password) {
        sendError(res, 400, "Fields 'mail' and 'password' are needed");
        return;
    }

    const mail = req.body.mail;
    const password = req.body.password;

    const user = await User.findOne({ where: { mail: mail } }) as any;
    const isPasswordValid = user !== null && await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
        sendError(res, 404, "User not found or invalid password");
        return
    }

    // A login rotates the devicetoken: the previous device is revoked
    // (PROTOCOL.md §5.4 — "one account = one active device").
    const devicetoken = randomUUID()
    await User.update({ devicetoken }, { where: { publickey: user.publickey } })

    const { publickey, name, mail: userMail, secretkey, status, blocks } = user;
    res.send({ publickey, name, mail: userMail, secretkey, status, blocks, devicetoken })
}

/**
 * Creates this server's core ecosystem, self-signed and self-validated by
 * its own freshly generated key (Phase-2.md §0.3/§2.2 — creation is free,
 * there is no admin to ask yet anyway). founderPk is recorded as
 * validatorpk purely for attribution, not as the chain's cryptographic
 * referent. Runs once, right after the founder's own account is created.
 */
async function createCoreEcosystem(founderPk: string): Promise<void> {
    const eco = new EcosystemBlockchain()
    const ecoSk = eco.makeBirthBlock(null, founderPk, process.env.ORGANIC_SERVER_NAME || 'Organic server')
    eco.validateAccount(ecoSk)
    await Ecosystem.create({
        publickey: eco.getMyPublicKey(),
        name: process.env.ORGANIC_SERVER_NAME || 'Organic server',
        blocks: eco.export(),
        ecosk: await encryptEcosystemKey(ecoSk),
        iscore: true,
        validatorpk: founderPk,
    })
}

export async function postRegister(req: Request, res: Response): Promise<void> {
    if (!req.body || !req.body.publickey || !req.body.name || !req.body.mail
        || !req.body.password || !req.body.secretkey || !req.body.blocks) {
        sendError(res, 400, "Fields 'publickey', 'name', 'mail', 'password', 'secretkey' and 'blocks' are needed.");
        return;
    }

    // Only the very first account on a fresh server self-validates (open
    // genesis, bootstrap) — see Phase-2.md §6 étape 5. It also creates the
    // server's core ecosystem in the same breath (below), so there is never
    // a window where a validated citizen exists with no one able to
    // validate the next one.
    const isBootstrap = (await User.count()) === 0

    const user: { publickey: string, name: string, mail: string, password: string, secretkey: string, birthdate: string | null, validatorpk: string | null, devicetoken: string, blocks: BlockWire[], status: MembershipStatus } = {
        publickey: req.body.publickey,
        name: req.body.name,
        mail: req.body.mail,
        password: await bcrypt.hash(req.body.password, 10),
        secretkey: req.body.secretkey,
        birthdate: req.body.birthdate ?? null,
        validatorpk: isBootstrap ? publicFromPrivate(SECRETKEY) : null,
        devicetoken: randomUUID(),
        blocks: req.body.blocks,
        status: isBootstrap ? 'active' : 'pending-validation',
    };

    try {
        if (isBootstrap) {
            user.blocks = validateBlockchain(user.blocks)
        } else {
            assertWaitingValidation(user.blocks)
        }
    } catch (err) {
        sendError(res, 400, "Invalid blockchain");
        return
    }

    try {
        const data = await User.create(user) as any
        if (isBootstrap) {
            await createCoreEcosystem(data.publickey)
        }
        res.send({ publickey: data.publickey, status: data.status, blocks: data.blocks, devicetoken: data.devicetoken })
    } catch (err) {
        sendError(res, 500, (err as Error).message || "Some error occurred while creating the User.");
    }
}

async function removeWaitingTransactions(lastblock: BlockWire, targetpk: string) {
    if (!lastblock.x) { return }
    const hashList = lastblock.x.filter(tx => tx.p === targetpk).map(tx => tx.h)

    if (hashList.length === 0) {
        return
    }
    await WaitingTx.destroy({
        where: {
            hash: {
                [Op.in]: hashList,
            }
        }
    })
}

/**
 * Save the given block for user of given publickey
 * Then remove from database every WaitingTx found in that block
 * (because they are no more waiting)
 */
export async function putSaveUser(req: Request, res: Response): Promise<void> {
    if (!req.body || !req.body.publickey || !req.body.block) {
        sendError(res, 400, "Fields 'publickey' and 'block' are needed.");
        return;
    }

    const publickey = req.body.publickey;
    const lastblock = req.body.block;
    let blocks;

    const user = await User.findOne({ where: { publickey: publickey } }) as any;

    if (!user) {
        res.status(404).send()
        return
    }

    // Devicetoken mismatch = a more recent login elsewhere revoked this device
    // (PROTOCOL.md §5.4). A user with no devicetoken yet (never logged in
    // since register, which always sets one) has nothing to compare against.
    if (user.devicetoken && user.devicetoken !== req.body.devicetoken) {
        sendError(res, 409, "This device has been revoked by a more recent login.", 'DEVICE_REVOKED');
        return
    }

    try {
        blocks = updateLastBlock(user.blocks, lastblock)
    } catch (err) {
        sendError(res, 500, `Error updating User with pk=${publickey} : "${err}"`);
        return
    }

    if (blocks === null) {
        sendError(res, 409, "Submitted block does not chain onto the currently stored last block.");
        return
    }

    try {
        await User.update(
            { blocks: blocks },
            { where: { publickey: publickey } }
        )
        await removeWaitingTransactions(blocks[0], publickey)
        res.send({ message: "User was updated successfully." });
    } catch (err) {
        sendError(res, 500, `Error updating User with pk=${publickey} : "${err}"`);
    }
}

export async function putSignAndSaveUser(req: Request, res: Response): Promise<void> {
    if (!req.body || !req.body.publickey || !req.body.block) {
        sendError(res, 400, "Fields 'publickey' and 'block' are needed.");
        return;
    }

    const publickey = req.body.publickey;
    const lastblock = req.body.block;

    const user = await User.findOne({ where: { publickey: publickey } }) as any;

    if (!user) {
        res.status(404).send()
        return
    }

    let newBlocks
    try {
        newBlocks = updateLastBlock(user.blocks, lastblock)
        if (newBlocks === null) {
            sendError(res, 409, "Submitted block does not chain onto the currently stored last block.");
            return
        }
        newBlocks = signLastBlock(newBlocks)
    } catch (err) {
        sendError(res, 500, `Error signing block for user pk=${publickey} : "${err}"`);
        return
    }

    try {
        await User.update(
            { blocks: newBlocks },
            { where: { publickey: publickey } }
        )
        res.send({ message: "User was updated successfully." });
    } catch (err) {
        sendError(res, 500, `Error updating User with pk=${publickey} : "${err}"`);
    }
}

/**
 * POST /users/password — timestamp-auth (proves possession of the key, not
 * just the login password). The client decrypts sk with the old password,
 * re-encrypts it with the new one, and sends both; the server updates the
 * bcrypt hash and the re-encrypted sk without ever reading either.
 */
export async function postChangePassword(req: Request, res: Response): Promise<void> {
    if (!req.body?.publickey || !req.body?.newpassword || !req.body?.secretkey) {
        sendError(res, 400, "Fields 'publickey', 'newpassword' and 'secretkey' are needed.");
        return;
    }
    const { publickey, newpassword, secretkey } = req.body

    const user = await User.findOne({ where: { publickey } })
    if (!user) {
        res.status(404).send()
        return
    }

    await User.update(
        { password: await bcrypt.hash(newpassword, 10), secretkey },
        { where: { publickey } }
    )
    res.send({ message: "Password updated successfully." })
}
