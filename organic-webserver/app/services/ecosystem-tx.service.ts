import { EcosystemBlockchain, TransactionMaker } from 'organic-money/src/index.js'
import { TxType } from 'organic-protocol'
import type { TxWire } from 'organic-protocol'
import { Ecosystem, WaitingTx } from '../models.js'
import { decryptEcosystemKey } from '../utils/ecosystem-key.util.js'

/** Role/order transaction types bind to an ecosystem via the `e` field, not `p`. */
const ROLE_AND_ORDER_TYPES = new Set<number>([
    TxType.SETADMIN, TxType.SETACTOR, TxType.SETPAYER,
    TxType.UNSETADMIN, TxType.UNSETACTOR, TxType.UNSETPAYER,
    TxType.PAYERORDER,
])

/** The ecosystem pk a wire transaction targets — the field differs by type (PROTOCOL.md §5.2b). */
export function ecosystemTarget(tx: TxWire): string | undefined {
    return ROLE_AND_ORDER_TYPES.has(tx.t) ? tx.e : tx.p
}

/**
 * Routes an already-produced EARN payout exactly like a normal payment
 * (Phase-2.md §6 étape 8): applied directly if the target is an ecosystem
 * hosted on this same server, queued in WaitingTx otherwise (assumed a
 * citizen — same as tx/send, the target's registration isn't re-verified
 * here either).
 */
export async function routeEarn(earnTx: any): Promise<void> {
    const targetPk = earnTx.target
    const targetEcoRow = await Ecosystem.findOne({ where: { publickey: targetPk } }) as any

    if (targetEcoRow) {
        const targetEco = new EcosystemBlockchain(targetEcoRow.blocks)
        targetEco.receiveEarn(earnTx)
        await Ecosystem.update({ blocks: targetEco.export() }, { where: { publickey: targetPk } })
        return
    }

    const exported = earnTx.export()
    await WaitingTx.create({ hash: exported.h, target: targetPk, tx: exported })
}

/**
 * Applies an already cross-verified transaction (caller's job, see
 * ecosystem-tx.controller.ts) to the ecosystem at ecosystemPk, then
 * persists it. A PAYERORDER additionally executes immediately — no
 * separate "claim" step, the resulting payment is routed the same request.
 */
export async function receiveEcosystemTx(ecosystemPk: string, tx: TxWire): Promise<void> {
    const row = await Ecosystem.findOne({ where: { publickey: ecosystemPk } }) as any
    const eco = new EcosystemBlockchain(row.blocks)
    const made = TransactionMaker.make(tx)

    switch (tx.t) {
        case TxType.PAY:
            eco.receivePay(made)
            break
        case TxType.ENGAGE:
            if (made.invests.length > 0) eco.receiveInvests(made)
            else eco.receiveMoney(made)
            break
        case TxType.SETADMIN:
            eco.receiveSetAdmin(made)
            break
        case TxType.UNSETADMIN:
            eco.receiveUnsetAdmin(made)
            break
        case TxType.SETACTOR:
            eco.receiveSetActor(made)
            break
        case TxType.UNSETACTOR:
            eco.receiveUnsetActor(made)
            break
        case TxType.SETPAYER:
            eco.receiveSetPayer(made)
            break
        case TxType.UNSETPAYER:
            eco.receiveUnsetPayer(made)
            break
        case TxType.PAYERORDER: {
            const ecoSk = await decryptEcosystemKey(row.ecosk)
            eco.receivePayerOrder(ecoSk, made)
            const earnTx = eco.order(ecoSk, made.target, made.invests, made.date)
            await Ecosystem.update({ blocks: eco.export() }, { where: { publickey: ecosystemPk } })
            await routeEarn(earnTx)
            return
        }
        default:
            throw new Error(`Transaction type ${tx.t} is not a valid ecosystem input.`)
    }

    await Ecosystem.update({ blocks: eco.export() }, { where: { publickey: ecosystemPk } })
}
