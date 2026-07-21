import type { Request, Response } from 'express'
import { TxType } from 'organic-protocol'
import { UsedPaper } from "../models.js";
import { isValidTransaction } from "../services/blockchain.service.js"
import { sendError } from '../utils/api-error.js'

/**
 * POST /papers/cash — requires the full PAPER transaction, not a bare hash:
 * the server verifies its crypto before registering tx.h as used. Anyone
 * who merely knew a hash used to be able to "burn" it without proof — this
 * closes that hole.
 */
export async function postCashPaper(req: Request, res: Response): Promise<void> {
    if (!req.body?.tx) {
        sendError(res, 400, "Content cannot be empty!");
        return;
    }
    const tx = req.body.tx

    if (tx.t !== TxType.PAPER || !isValidTransaction(tx)) {
        sendError(res, 400, "Invalid or non-PAPER transaction.", 'INVALID_TX');
        return;
    }

    const alreadyCashed = await UsedPaper.findOne({ where: { hash: tx.h } })
    if (alreadyCashed !== null) {
        sendError(res, 409, "Paper already cashed.", 'ALREADY_CASHED');
        return;
    }

    try {
        await UsedPaper.create({ hash: tx.h })
        res.send({ message: "Papers successfully cashed." });
    } catch (err) {
        sendError(res, 500, (err as Error).message || "Some error occurred while creating the paper.")
    }
}

/**
 * hash (141 characters)
 */
export async function getIsCashed(req: Request, res: Response): Promise<void> {
    if (!req.query || !req.query.hash) {
        res.status(400).send({ message: "Content can not be empty!" });
        return;
    }

    const hash = req.query.hash as string

    if (hash.length < 141 || hash.length > 141) {
        res.status(400).send({ message: "Invalid hash format." });
        return;
    }

    const alreadyUsedPaper = await UsedPaper.findOne({
        where: {
            hash: hash,
        }
    });

    if (alreadyUsedPaper === null) {
        res.status(404).send()
    } else {
        res.send(hash);
    }
}
