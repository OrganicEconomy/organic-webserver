import type { Request, Response } from 'express'
import { TxType } from 'organic-protocol'
import { EcosystemBlockchain, TransactionMaker } from 'organic-money/src/index.js'
import { UsedPaper, Ecosystem } from "../models.js";
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
    } catch (err) {
        sendError(res, 500, (err as Error).message || "Some error occurred while creating the paper.")
        return
    }

    // Only a paper targeting a known Ecosystem gets applied to its chain —
    // an old paper from before a core ecosystem existed just registers the
    // hash above, as it always did (Phase-2.md §6 étape 10).
    const targetEcoRow = await Ecosystem.findOne({ where: { publickey: tx.p } }) as any
    if (targetEcoRow) {
        const eco = new EcosystemBlockchain(targetEcoRow.blocks)
        eco.cashPaper(TransactionMaker.make(tx))
        await Ecosystem.update({ blocks: eco.export() }, { where: { publickey: tx.p } })
    }

    res.send({ message: "Papers successfully cashed." });
}

// A DER-encoded SECP256K1 signature (hex) doesn't have a fixed length — it
// varies with r/s padding (observed 136-142 chars over 20000 samples; hex is
// always even-length, hence pairs below). 130-146 is a generous margin around
// that, wide enough to never reject a real signature but still catching
// garbage/wrong-format input.
const SIGNATURE_HASH_PATTERN = /^([0-9a-f]{2}){65,73}$/i

export async function getIsCashed(req: Request, res: Response): Promise<void> {
    if (!req.query || !req.query.hash) {
        res.status(400).send({ message: "Content can not be empty!" });
        return;
    }

    const hash = req.query.hash as string

    if (!SIGNATURE_HASH_PATTERN.test(hash)) {
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
