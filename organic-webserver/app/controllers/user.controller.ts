import type { Request, Response } from 'express'
import { randomUUID } from 'node:crypto'
import { User, WaitingTx, sequelize } from "../models.js"
import { Op } from 'sequelize'
import bcrypt from 'bcryptjs'
import type { BlockWire, MembershipStatus } from 'organic-protocol'
import { publicFromPrivate } from 'organic-money/src/index.js'

import { validateBlockchain, assertWaitingValidation, assertIsOwnedBy, updateLastBlock, signLastBlock, type BlockUpdateFailure } from '../services/blockchain.service.js'
import { createEcosystem } from '../services/ecosystem.service.js'
import { findPapersToCash, holdsOnlyPapersCashedBy, registerCashedPapers, sendPaperCashingError } from '../services/paper-cashing.service.js'
import { sendError } from '../utils/api-error.js'
import { hasTextFields, findTooLongField } from '../utils/request-fields.util.js'

const SECRETKEY = process.env.ORGANIC_SECRET_KEY as string
const REGISTER_MAX_LENGTHS: Record<string, number> = { name: 100, mail: 254 }
const UNKNOWN_MAIL_HASH = bcrypt.hashSync(randomUUID(), 10)

export async function postLoginUser(req: Request, res: Response): Promise<void> {
    if (!hasTextFields(req.body, ['mail', 'password'])) {
        sendError(res, 400, "Fields 'mail' and 'password' are needed");
        return;
    }

    const mail = normalizeMail(req.body.mail);
    const password = req.body.password;

    const user = await User.findOne({ where: { mail: mail } }) as any;
    const isPasswordValid = await bcrypt.compare(password, user?.password ?? UNKNOWN_MAIL_HASH) && user !== null;

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

function normalizeMail(mail: string): string {
    return mail.trim().toLowerCase()
}

export async function postRegister(req: Request, res: Response): Promise<void> {
    if (!hasTextFields(req.body, ['publickey', 'name', 'mail', 'password', 'secretkey']) || !req.body.blocks) {
        sendError(res, 400, "Fields 'publickey', 'name', 'mail', 'password', 'secretkey' and 'blocks' are needed.");
        return;
    }

    // Only the very first account on a fresh server self-validates (open
    // genesis, bootstrap) — see Phase-2.md §6 étape 5. It also creates the
    // server's core ecosystem in the same breath (below), so there is never
    // a window where a validated citizen exists with no one able to
    // validate the next one.
    const tooLongField = findTooLongField(req.body, REGISTER_MAX_LENGTHS)
    if (tooLongField) {
        sendError(res, 400, `Field '${tooLongField}' must be at most ${REGISTER_MAX_LENGTHS[tooLongField]} characters long.`);
        return
    }

    const mail = normalizeMail(req.body.mail)
    if (await User.findOne({ where: { mail } })) {
        sendError(res, 409, "This mail is already used by another account.");
        return
    }

    const isBootstrap = (await User.count()) === 0

    const user: { publickey: string, name: string, mail: string, password: string, secretkey: string, birthdate: string | null, validatorpk: string | null, devicetoken: string, blocks: BlockWire[], status: MembershipStatus } = {
        publickey: req.body.publickey,
        name: req.body.name,
        mail,
        password: await bcrypt.hash(req.body.password, 10),
        secretkey: req.body.secretkey,
        birthdate: req.body.birthdate ?? null,
        validatorpk: isBootstrap ? publicFromPrivate(SECRETKEY) : null,
        devicetoken: randomUUID(),
        blocks: req.body.blocks,
        status: isBootstrap ? 'active' : 'pending-validation',
    };

    try {
        assertIsOwnedBy(user.blocks, user.publickey)
        if (isBootstrap) {
            user.blocks = validateBlockchain(user.blocks)
        } else {
            assertWaitingValidation(user.blocks)
        }
    } catch (err) {
        sendError(res, 400, "Invalid blockchain");
        return
    }

    const data = await User.create(user) as any
    if (isBootstrap) {
        await createEcosystem(data.publickey, process.env.ORGANIC_SERVER_NAME || 'Organic server')
    }
    res.send({ publickey: data.publickey, status: data.status, blocks: data.blocks, devicetoken: data.devicetoken })
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
    if (!req.body?.block) {
        sendError(res, 400, "Field 'block' is needed.");
        return;
    }

    const publickey = res.locals.authenticatedPk as string;
    const lastblock = req.body.block;

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

    const update = updateLastBlock(user.blocks, lastblock)
    if ('failure' in update) {
        sendBlockUpdateError(res, update.failure)
        return
    }
    const blocks = update.blocks

    if (!await holdsOnlyPapersCashedBy(lastblock, publickey)) {
        sendError(res, 400, "Submitted block holds a paper that was not cashed through /users/sign.");
        return
    }

    await User.update(
        { blocks: blocks },
        { where: { publickey: publickey } }
    )
    await removeWaitingTransactions(blocks[0], publickey)
    res.send({ message: "User was updated successfully." });
}

const BLOCK_UPDATE_ERRORS: Record<BlockUpdateFailure, { status: number, message: string }> = {
    'invalid-block': { status: 400, message: "Submitted block is invalid." },
    'not-chaining': { status: 409, message: "Submitted block does not chain onto the currently stored last block." },
}

function sendBlockUpdateError(res: Response, failure: BlockUpdateFailure): void {
    const { status, message } = BLOCK_UPDATE_ERRORS[failure]
    sendError(res, status, message)
}

export async function putSignAndSaveUser(req: Request, res: Response): Promise<void> {
    if (!req.body?.block) {
        sendError(res, 400, "Field 'block' is needed.");
        return;
    }

    const publickey = res.locals.authenticatedPk as string;
    const lastblock = req.body.block;

    const user = await User.findOne({ where: { publickey: publickey } }) as any;

    if (!user) {
        res.status(404).send()
        return
    }

    if (user.status !== 'active') {
        sendError(res, 403, "Only an active citizen can have a block signed.");
        return
    }

    const update = updateLastBlock(user.blocks, lastblock)
    if ('failure' in update) {
        sendBlockUpdateError(res, update.failure)
        return
    }

    const papersToCash = await findPapersToCash(lastblock, publickey)
    if ('failure' in papersToCash) {
        sendPaperCashingError(res, papersToCash)
        return
    }

    if (papersToCash.papers.length === 0) {
        res.send({ message: "Nothing new to sign." })
        return
    }

    const newBlocks = await signLastBlock(update.blocks)
    await sequelize.transaction(async (transaction) => {
        await registerCashedPapers(papersToCash.papers, publickey, transaction)
        await User.update({ blocks: newBlocks }, { where: { publickey }, transaction })
    })
    res.send({ message: "User was updated successfully." });
}

/**
 * POST /users/password — timestamp-auth (proves possession of the key, not
 * just the login password). The client decrypts sk with the old password,
 * re-encrypts it with the new one, and sends both; the server updates the
 * bcrypt hash and the re-encrypted sk without ever reading either.
 */
export async function postChangePassword(req: Request, res: Response): Promise<void> {
    if (!hasTextFields(req.body, ['newpassword', 'secretkey'])) {
        sendError(res, 400, "Fields 'newpassword' and 'secretkey' are needed.");
        return;
    }
    const publickey = res.locals.authenticatedPk as string
    const { newpassword, secretkey } = req.body

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
