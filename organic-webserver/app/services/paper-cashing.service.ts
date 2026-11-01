import type { Response } from 'express'
import type { Transaction } from 'sequelize'
import { TxType, type BlockWire, type TxWire } from 'organic-protocol'
import { EcosystemBlockchain, TransactionMaker } from 'organic-money/src/index.js'
import { Ecosystem, UsedPaper } from '../models.js'
import { findCrossVerificationFailure, sendCrossVerificationError, type CrossVerificationFailure } from './cross-verification.service.js'
import { sendError } from '../utils/api-error.js'

export type PaperCashingFailure = CrossVerificationFailure | 'already-cashed' | 'unknown-ecosystem'

function papersCashedIn(block: BlockWire, casherPk: string): TxWire[] {
    return block.x.filter(tx => tx.t === TxType.PAPER && tx.s !== casherPk)
}

export async function holdsOnlyPapersCashedBy(block: BlockWire, casherPk: string): Promise<boolean> {
    const papers = papersCashedIn(block, casherPk)
    const registered = await UsedPaper.count({ where: { hash: papers.map(paper => paper.h), casher: casherPk } })
    return registered === papers.length
}

export type PapersToCash = { papers: TxWire[] } | { failure: PaperCashingFailure }

export async function findPapersToCash(block: BlockWire, casherPk: string): Promise<PapersToCash> {
    const papers = papersCashedIn(block, casherPk)
    const casherByHash = await registeredCashers(papers)
    const newPapers = []
    for (const paper of papers) {
        if (casherByHash.has(paper.h)) {
            if (casherByHash.get(paper.h) !== casherPk) return { failure: 'already-cashed' }
            continue
        }
        const failure = await findNewPaperFailure(paper)
        if (failure) return { failure }
        newPapers.push(paper)
    }
    return { papers: newPapers }
}

async function registeredCashers(papers: TxWire[]): Promise<Map<string, string | null>> {
    const usedPapers = await UsedPaper.findAll({ where: { hash: papers.map(paper => paper.h) } }) as any[]
    return new Map(usedPapers.map(usedPaper => [usedPaper.hash, usedPaper.casher]))
}

async function findNewPaperFailure(paper: TxWire): Promise<PaperCashingFailure | null> {
    if (!await isKnownEcosystem(paper.p)) return 'unknown-ecosystem'
    return findCrossVerificationFailure(paper)
}

async function isKnownEcosystem(publickey: string): Promise<boolean> {
    return await Ecosystem.count({ where: { publickey } }) > 0
}

export function sendPaperCashingError(res: Response, failure: PaperCashingFailure): void {
    if (failure === 'already-cashed') {
        sendError(res, 409, "Paper already cashed.", 'ALREADY_CASHED')
    } else if (failure === 'unknown-ecosystem') {
        sendError(res, 400, "Paper targets an unknown ecosystem.", 'INVALID_TX')
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

async function creditTargetEcosystem(paper: TxWire, transaction: Transaction): Promise<void> {
    const ecoRow = await Ecosystem.findOne({ where: { publickey: paper.p }, transaction, lock: transaction.LOCK.UPDATE }) as any

    const eco = new EcosystemBlockchain(ecoRow.blocks)
    eco.cashPaper(TransactionMaker.make(paper))
    await Ecosystem.update({ blocks: eco.export() }, { where: { publickey: paper.p }, transaction })
}
