import type { Response } from 'express'
import type { ApiErrorCode, TxWire } from 'organic-protocol'
import { User } from '../models.js'
import { loadValidChain, chainContainsTx } from './blockchain.service.js'
import { sendError } from '../utils/api-error.js'

export type CrossVerificationFailure = 'unknown-sender' | 'invalid-chain' | 'inactive-sender' | 'tx-not-in-chain'

const FAILURE_RESPONSES: Record<CrossVerificationFailure, { status: number, error: string, code: ApiErrorCode }> = {
    'unknown-sender': { status: 403, error: "Sender is not a registered user.", code: 'UNKNOWN_SENDER' },
    'invalid-chain': { status: 400, error: "Sender's saved chain is invalid.", code: 'INVALID_CHAIN' },
    'inactive-sender': { status: 403, error: "Sender is not an active citizen.", code: 'UNKNOWN_SENDER' },
    'tx-not-in-chain': { status: 404, error: "Transaction not found in sender's saved chain.", code: 'TX_NOT_IN_CHAIN' },
}

/** PROTOCOL.md §5.3: the signer must be an active citizen whose saved, valid chain holds this very transaction. */
export async function findCrossVerificationFailure(tx: TxWire): Promise<CrossVerificationFailure | null> {
    const sender = await User.findOne({ where: { publickey: tx.s } }) as any
    if (!sender) return 'unknown-sender'

    const chain = loadValidChain(sender.blocks)
    if (!chain) return 'invalid-chain'
    if (sender.status !== 'active') return 'inactive-sender'
    if (!chainContainsTx(chain, tx.h)) return 'tx-not-in-chain'
    return null
}

export function sendCrossVerificationError(res: Response, failure: CrossVerificationFailure): void {
    const { status, error, code } = FAILURE_RESPONSES[failure]
    sendError(res, status, error, code)
}
