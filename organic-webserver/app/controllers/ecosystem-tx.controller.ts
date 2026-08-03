import type { Request, Response } from 'express'
import { User, Ecosystem } from '../models.js'
import { sendError } from '../utils/api-error.js'
import { isValidTransaction, loadValidChain, chainContainsTx } from '../services/blockchain.service.js'
import { ecosystemTarget, receiveEcosystemTx } from '../services/ecosystem-tx.service.js'

/**
 * POST /ecosystems/:pk/tx — generic ingress for any citizen-signed
 * transaction targeting this ecosystem (PAY/ENGAGE/role/PAYERORDER).
 * Same cross-verification duty as tx/send (PROTOCOL.md §5.3), against the
 * *signer's* own saved chain — mirrors waiting-tx.controller.ts::createWaitingTx.
 */
export async function postEcosystemTx(req: Request, res: Response): Promise<void> {
    if (!req.body?.tx) {
        sendError(res, 400, "Content cannot be empty!")
        return
    }
    const tx = req.body.tx
    const targetPk = req.params.pk as string

    if (!isValidTransaction(tx)) {
        sendError(res, 400, "Invalid transaction!", 'INVALID_TX')
        return
    }

    if (ecosystemTarget(tx) !== targetPk) {
        sendError(res, 400, "Transaction does not target this ecosystem.", 'INVALID_TX')
        return
    }

    const sender = await User.findOne({ where: { publickey: tx.s } })
    if (!sender) {
        sendError(res, 403, "Sender is not a registered user.", 'UNKNOWN_SENDER')
        return
    }

    const chain = loadValidChain((sender as any).blocks)
    if (!chain) {
        sendError(res, 400, "Sender's saved chain is invalid.", 'INVALID_CHAIN')
        return
    }

    if (!chainContainsTx(chain, tx.h)) {
        sendError(res, 404, "Transaction not found in sender's saved chain.", 'TX_NOT_IN_CHAIN')
        return
    }

    const ecoRow = await Ecosystem.findOne({ where: { publickey: targetPk } })
    if (!ecoRow) {
        res.status(404).send()
        return
    }

    try {
        await receiveEcosystemTx(targetPk, tx)
        res.send({ message: "Transaction applied." })
    } catch (err) {
        sendError(res, 400, (err as Error).message || "Could not apply transaction to ecosystem.", 'INVALID_TX')
    }
}
