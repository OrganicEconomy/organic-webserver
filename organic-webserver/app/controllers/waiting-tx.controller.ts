import type { Request, Response } from 'express'
import { TxType, type BlockWire, type TxVerifyResponse, type TxWire } from 'organic-protocol'
import { WaitingTx, User } from "../models.js";
import { isValidTransaction } from "../services/blockchain.service.js"
import { sendError } from '../utils/api-error.js'
import { findCrossVerificationFailure, sendCrossVerificationError, type CrossVerificationFailure } from '../services/cross-verification.service.js'

/**
 * POST /tx/send — PROTOCOL.md §5.3, the security core of the phase.
 * Cross-verification: ① crypto valid ② sender registered ③ sender's SAVED
 * chain valid ④ the tx exists in that chain's history. Without step ④,
 * anyone could sign a transaction carrying units they never owned — hence
 * the strict client-side order pay → save → send.
 */
export async function createWaitingTx(req: Request, res: Response): Promise<void> {
    if (!req.body?.tx) {
        sendError(res, 400, "Content cannot be empty!");
        return;
    }
    const tx = req.body.tx

    if (!isValidTransaction(tx)) {
        sendError(res, 400, "Invalid transaction!", 'INVALID_TX');
        return;
    }

    if (tx.t !== TxType.PAY) {
        sendError(res, 400, "Only PAY transactions can be sent.", 'INVALID_TX');
        return;
    }

    const failure = await findCrossVerificationFailure(tx)
    if (failure) {
        sendCrossVerificationError(res, failure)
        return
    }

    if (await isAlreadySent(tx)) {
        sendError(res, 409, "Transaction already sent.");
        return;
    }

    const waitingtx = {
        hash: tx.h,
        target: tx.p,
        tx: tx
    };

    try {
        await WaitingTx.create(waitingtx)
        res.send({ message: "Transaction successfully saved." })
    } catch (err) {
        sendError(res, 500, (err as Error).message || "Some error occurred while creating the transaction.")
    }
}

async function isAlreadySent(tx: TxWire): Promise<boolean> {
    return await isWaiting(tx) || await isInReceiverSavedChain(tx)
}

async function isWaiting(tx: TxWire): Promise<boolean> {
    return (await WaitingTx.findOne({ where: { hash: tx.h } })) !== null
}

async function isInReceiverSavedChain(tx: TxWire): Promise<boolean> {
    const receiver = await User.findOne({ where: { publickey: tx.p } }) as any
    if (!receiver) return false
    return (receiver.blocks as BlockWire[]).some(block => block.x.some(savedTx => savedTx.h === tx.h))
}

export async function listWaitingTx(req: Request, res: Response): Promise<void> {
    const publickey = res.locals.authenticatedPk as string
    const transactions = await WaitingTx.findAll({ where: { target: publickey } });
    // PROTOCOL.md §5.2: the response is a bare TxWire[] — hash/target/createdAt
    // are WaitingTx's own storage details, not part of the wire protocol.
    res.send(transactions.map((t: any) => t.tx))
}

/**
 * POST /tx/verify — public, read-only. Confirms an offline payment received
 * hand-to-hand once the network is back: `send` routes a payment forward,
 * `verify` only checks it against the sender's saved chain, never writes.
 */
export async function verifyTx(req: Request, res: Response): Promise<void> {
    if (!req.body?.tx) {
        sendError(res, 400, "Content cannot be empty!");
        return;
    }
    const tx = req.body.tx
    const respond = (status: TxVerifyResponse['status']) => res.send({ status } satisfies TxVerifyResponse)

    if (!isValidTransaction(tx)) {
        respond('invalid');
        return;
    }

    const failure = await findCrossVerificationFailure(tx)
    respond(failure ? VERIFY_STATUS_BY_FAILURE[failure] : 'confirmed')
}

const VERIFY_STATUS_BY_FAILURE: Record<CrossVerificationFailure, TxVerifyResponse['status']> = {
    'unknown-sender': 'unknown-sender',
    'inactive-sender': 'unknown-sender',
    'invalid-chain': 'invalid',
    'tx-not-in-chain': 'pending',
}
