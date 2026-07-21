import type { Request, Response } from 'express'
import type { TxVerifyResponse } from 'organic-protocol'
import { WaitingTx, User } from "../models.js";
import { isValidTransaction, loadValidChain, chainContainsTx } from "../services/blockchain.service.js"
import { sendError } from '../utils/api-error.js'

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

    const sender = await User.findOne({ where: { publickey: tx.s } });
    if (!sender) {
        sendError(res, 403, "Sender is not a registered user.", 'UNKNOWN_SENDER');
        return;
    }

    const chain = loadValidChain((sender as any).blocks)
    if (!chain) {
        sendError(res, 400, "Sender's saved chain is invalid.", 'INVALID_CHAIN');
        return;
    }

    if (!chainContainsTx(chain, tx.h)) {
        sendError(res, 404, "Transaction not found in sender's saved chain.", 'TX_NOT_IN_CHAIN');
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

export async function listWaitingTx(req: Request, res: Response): Promise<void> {
    const publickey = req.query.publickey;
    const transactions = await WaitingTx.findAll({ where: { target: publickey } });
    res.send(transactions)
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

    const sender = await User.findOne({ where: { publickey: tx.s } });
    if (!sender) {
        respond('unknown-sender');
        return;
    }

    const chain = loadValidChain((sender as any).blocks)
    if (!chain) {
        respond('invalid');
        return;
    }

    respond(chainContainsTx(chain, tx.h) ? 'confirmed' : 'pending')
}
