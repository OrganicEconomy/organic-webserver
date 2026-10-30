import type { Response } from 'express'
import type { Transaction } from 'sequelize'
import { TxType, type BlockWire, type TxWire } from 'organic-protocol'
import { EcosystemBlockchain, TransactionMaker } from 'organic-money/src/index.js'
import { Ecosystem, UsedPaper } from '../models.js'
import { findCrossVerificationFailure, sendCrossVerificationError, type CrossVerificationFailure } from './cross-verification.service.js'
import { sendError } from '../utils/api-error.js'

export type PaperCashingFailure = CrossVerificationFailure | 'already-cashed'

function papersCashedIn(block: BlockWire, casherPk: string): TxWire[] {
    return block.x.filter(tx => tx.t === TxType.PAPER && tx.s !== casherPk)
}

export async function newlyCashedPapers(block: BlockWire, casherPk: string): Promise<TxWire[]> {
    const papers = papersCashedIn(block, casherPk)
    const registered = await UsedPaper.findAll({ where: { hash: papers.map(paper => paper.h) } }) as any[]
    const registeredHashes = new Set(registered.map(usedPaper => usedPaper.hash))
    return papers.filter(paper => !registeredHashes.has(paper.h))
}

export async function holdsOnlyPapersCashedBy(block: BlockWire, casherPk: string): Promise<boolean> {
    const papers = papersCashedIn(block, casherPk)
    const registered = await UsedPaper.count({ where: { hash: papers.map(paper => paper.h), casher: casherPk } })
    return registered === papers.length
}

export async function findPaperCashingFailure(block: BlockWire, casherPk: string): Promise<PaperCashingFailure | null> {
    for (const paper of papersCashedIn(block, casherPk)) {
        const usedPaper = await UsedPaper.findOne({ where: { hash: paper.h } }) as any
        if (usedPaper) {
            if (usedPaper.casher !== casherPk) return 'already-cashed'
            continue
        }
        const failure = await findCrossVerificationFailure(paper)
        if (failure) return failure
    }
    return null
}

export function sendPaperCashingError(res: Response, failure: PaperCashingFailure): void {
    if (failure === 'already-cashed') {
        sendError(res, 409, "Paper already cashed.", 'ALREADY_CASHED')
    } else {
        sendCrossVerificationError(res, failure)
    }
}

export async function registerCashedPapers(papers: TxWire[], casherPk: string, transaction: Transaction): Promise<void> {
    for (const paper of papers) {
        await UsedPaper.create({ hash: paper.h, casher: casherPk }, { transaction })
        await creditTargetEcosystem(paper, transaction)
    }
}

/**
 * A paper targeting the server's own key (issued before a core ecosystem
 * existed) has no ecosystem chain to credit: only its hash is registered.
 */
async function creditTargetEcosystem(paper: TxWire, transaction: Transaction): Promise<void> {
    const ecoRow = await Ecosystem.findOne({ where: { publickey: paper.p }, transaction }) as any
    if (!ecoRow) return

    const eco = new EcosystemBlockchain(ecoRow.blocks)
    eco.cashPaper(TransactionMaker.make(paper))
    await Ecosystem.update({ blocks: eco.export() }, { where: { publickey: paper.p }, transaction })
}
