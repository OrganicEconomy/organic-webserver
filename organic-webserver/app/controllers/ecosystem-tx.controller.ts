import type { Request, Response } from 'express'
import { EcosystemBlockchain } from 'organic-money/src/index.js'
import { User, Ecosystem } from '../models.js'
import { sendError } from '../utils/api-error.js'
import { isValidTransaction, loadValidChain, chainContainsTx } from '../services/blockchain.service.js'
import { ecosystemTarget, receiveEcosystemTx, routeEarn } from '../services/ecosystem-tx.service.js'
import { decryptEcosystemKey } from '../utils/ecosystem-key.util.js'

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

/**
 * POST /ecosystems/:pk/distribute — timestamp-auth, caller must be an admin
 * of :pk. Manual only (Phase-2.md §6 étape 9) — no scheduling.
 * Each resulting EARN is routed exactly like a payer-order payout.
 */
export async function postDistributeSalary(req: Request, res: Response): Promise<void> {
    const publickey = req.body?.publickey
    const pk = req.params.pk as string

    const row = await Ecosystem.findOne({ where: { publickey: pk } }) as any
    if (!row) {
        res.status(404).send()
        return
    }

    const eco = new EcosystemBlockchain(row.blocks)
    if (!eco.isAdmin(publickey)) {
        sendError(res, 403, "Not an admin of this ecosystem", 'NOT_CORE_ADMIN')
        return
    }

    const ecoSk = await decryptEcosystemKey(row.ecosk)
    const earns = eco.distributeSalary(ecoSk)
    await Ecosystem.update({ blocks: eco.export() }, { where: { publickey: pk } })

    for (const earnTx of earns) {
        await routeEarn(earnTx)
    }

    res.send({ message: "Salaries distributed." })
}
