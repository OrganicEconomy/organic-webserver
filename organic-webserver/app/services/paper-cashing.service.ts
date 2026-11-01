import type { Response } from 'express'
import type { Transaction } from 'sequelize'
import { TxType, type BlockWire, type TxWire } from 'organic-protocol'
import { Ecosystem, UsedPaper } from '../models.js'
import { findCrossVerificationFailure, sendCrossVerificationError, type CrossVerificationFailure } from './cross-verification.service.js'
import { sendError } from '../utils/api-error.js'

export type PaperCashingFailure = CrossVerificationFailure | 'already-cashed' | 'not-core-referent'

function papersCashedIn(block: BlockWire, casherPk: string): TxWire[] {
    return block.x.filter(tx => tx.t === TxType.PAPER && tx.s !== casherPk)
}

export async function holdsOnlyPapersCashedBy(block: BlockWire, casherPk: string): Promise<boolean> {
    const papers = papersCashedIn(block, casherPk)
    const registered = await UsedPaper.count({ where: { hash: papers.map(paper => paper.h), casher: casherPk } })
    return registered === papers.length
}

export type PaperRefusal = { failure: PaperCashingFailure, paperHash: string }
export type PapersToCash = { papers: TxWire[] } | PaperRefusal

export async function findPapersToCash(block: BlockWire, casherPk: string): Promise<PapersToCash> {
    const papers = papersCashedIn(block, casherPk)
    const casherByHash = await registeredCashers(papers)
    const newPapers = []
    for (const paper of papers) {
        if (casherByHash.has(paper.h)) {
            if (casherByHash.get(paper.h) !== casherPk) return { failure: 'already-cashed', paperHash: paper.h }
            continue
        }
        const failure = await findNewPaperFailure(paper)
        if (failure) return { failure, paperHash: paper.h }
        newPapers.push(paper)
    }
    return { papers: newPapers }
}

async function registeredCashers(papers: TxWire[]): Promise<Map<string, string | null>> {
    const usedPapers = await UsedPaper.findAll({ where: { hash: papers.map(paper => paper.h) } }) as any[]
    return new Map(usedPapers.map(usedPaper => [usedPaper.hash, usedPaper.casher]))
}

async function findNewPaperFailure(paper: TxWire): Promise<PaperCashingFailure | null> {
    if (!await isCore(paper.p)) return 'not-core-referent'
    return findCrossVerificationFailure(paper)
}

async function isCore(publickey: string): Promise<boolean> {
    return await Ecosystem.count({ where: { publickey, iscore: true } }) > 0
}

export function sendPaperCashingError(res: Response, { failure, paperHash }: PaperRefusal): void {
    if (failure === 'already-cashed') {
        sendError(res, 409, "Paper already cashed.", 'ALREADY_CASHED', paperHash)
    } else if (failure === 'not-core-referent') {
        sendError(res, 400, "Paper's referent is not this server's core.", 'INVALID_TX', paperHash)
    } else {
        sendCrossVerificationError(res, failure, paperHash)
    }
}

export async function registerCashedPapers(papers: TxWire[], casherPk: string, transaction: Transaction): Promise<void> {
    for (const paper of papers) {
        await UsedPaper.create({ hash: paper.h, casher: casherPk }, { transaction })
    }
}
