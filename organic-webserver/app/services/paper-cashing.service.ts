import type { Response } from 'express'
import type { Transaction } from 'sequelize'
import { TxType, type BlockWire, type TxWire } from 'organic-protocol'
import { EcosystemBlockchain, TransactionMaker, publicFromPrivate } from 'organic-money/src/index.js'
import { Ecosystem, UsedPaper } from '../models.js'
import { findCrossVerificationFailure, sendCrossVerificationError, type CrossVerificationFailure } from './cross-verification.service.js'
import { sendError } from '../utils/api-error.js'

export type PaperCashingFailure = CrossVerificationFailure | 'already-cashed' | 'unknown-referent'

const SERVER_PK = publicFromPrivate(process.env.ORGANIC_SECRET_KEY as string)

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
    if (!await isKnownReferent(paper.p)) return 'unknown-referent'
    return findCrossVerificationFailure(paper)
}

async function isKnownReferent(referentPk: string): Promise<boolean> {
    return referentPk === SERVER_PK || await Ecosystem.count({ where: { publickey: referentPk } }) > 0
}

export function sendPaperCashingError(res: Response, failure: PaperCashingFailure): void {
    if (failure === 'already-cashed') {
        sendError(res, 409, "Paper already cashed.", 'ALREADY_CASHED')
    } else if (failure === 'unknown-referent') {
        sendError(res, 400, "Paper targets an unknown referent.", 'INVALID_TX')
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
    const ecoRow = await Ecosystem.findOne({ where: { publickey: paper.p }, transaction, lock: transaction.LOCK.UPDATE }) as any
    if (!ecoRow) return

    const eco = new EcosystemBlockchain(ecoRow.blocks)
    eco.cashPaper(TransactionMaker.make(paper))
    await Ecosystem.update({ blocks: eco.export() }, { where: { publickey: paper.p }, transaction })
}
