import { Blockchain, CitizenBlockchain, BlockMaker, TransactionMaker, publicFromPrivate } from 'organic-money/src/index.js';
import type { BlockWire, TxWire } from 'organic-protocol'
import { Ecosystem } from '../models.js'
import { decryptEcosystemKey } from '../utils/ecosystem-key.util.js'

const SECRETKEY = process.env.ORGANIC_SECRET_KEY as string

export function validateBlockchain(blocks: BlockWire[]) {
    const blockchain = new CitizenBlockchain(blocks)
    if (! blockchain.isWaitingValidation()) {
        throw new Error(`Given blockchain isn't made for validation :  ${blocks}`)
    }
    blockchain.validateAccount(SECRETKEY)
    return blockchain.export()
}

/**
 * Same shape check as validateBlockchain (a lone, well-formed BirthBlock),
 * without signing — for a Phase 2 registration that isn't the server's
 * open-genesis bootstrap and must stay pending-validation instead.
 */
export function assertWaitingValidation(blocks: BlockWire[]): void {
    const blockchain = new CitizenBlockchain(blocks)
    if (!blockchain.isWaitingValidation()) {
        throw new Error(`Given blockchain isn't made for validation :  ${blocks}`)
    }
}

/**
 * Applies a client-submitted block to the stored chain: either an update of
 * the current last block (same previousHash — more transactions, or newly
 * signed), or a genuinely new block chained onto it (previousHash equals the
 * current last block's own signature). Returns null if neither holds — the
 * submitted block does not chain onto what the server has, meaning one or
 * more blocks were closed locally without ever being saved in between (a
 * gap), rather than silently accepting a chain with a hole in it.
 */
export function updateLastBlock(blocks: BlockWire[], lastblock: BlockWire) {
    const madeLastblock = BlockMaker.make(lastblock)

    const blockchain = new CitizenBlockchain(blocks)

    if (blockchain.lastblock.previousHash === madeLastblock.previousHash) {
        blockchain.blocks[0] = madeLastblock
    } else if (madeLastblock.previousHash === blockchain.lastblock.signature) {
        blockchain.addBlock(madeLastblock)
    } else {
        return null
    }
    return blockchain.export()
}

/**
 * The server signs as a referent (bills, genesis), not as the chain's owner —
 * `Blockchain.closeLastBlock` now asserts the signing key matches the chain
 * owner (organic-money 0.2.5), which is correct for a citizen closing their
 * own block but wrong here. Sign the block directly instead, as the library
 * itself does internally minus that ownership guard.
 *
 * A block containing a paper (getPapersHandler()) must be signed by whoever
 * that paper targets — the server's own key only for old papers already in
 * circulation from before a core ecosystem existed (or a block with no
 * paper at all, e.g. genesis); a known Ecosystem's own key otherwise
 * (Phase-2.md §6 étape 10).
 */
export async function signLastBlock(blocks: BlockWire[]) {
    const blockchain = new CitizenBlockchain(blocks)
    if (!!blockchain.lastblock.isSigned()) {
        throw new Error(`Given block is already signed.`)
    }

    const handlerPk = blockchain.lastblock.getPapersHandler()
    let signingKey = SECRETKEY
    if (handlerPk !== null && handlerPk !== publicFromPrivate(SECRETKEY)) {
        const eco = await Ecosystem.findOne({ where: { publickey: handlerPk } }) as any
        if (!eco) {
            throw new Error('Unknown papers handler.')
        }
        signingKey = await decryptEcosystemKey(eco.ecosk)
    }

    blockchain.lastblock.sign(signingKey)
    return blockchain.export()
}

export function isValidTransaction(tx: TxWire): boolean {
    try {
        return TransactionMaker.make(tx).isValid()
    } catch {
        return false
    }
}

/**
 * Load a citizen's SAVED chain and assert it is valid AND validated
 * (PROTOCOL.md §5.3, step 2). A chain can be perfectly well-formed and still
 * be a lone, self-signed BirthBlock awaiting a referent's approval — that
 * passes assertIsValid() (it's not corrupt), but must not be treated as
 * trustworthy for cross-verification: a not-yet-validated account has no
 * business sending or being credited with cross-verified transactions.
 * Returns null instead of throwing — call sites turn that into INVALID_CHAIN.
 */
export function loadValidChain(blocks: BlockWire[]) {
    try {
        const blockchain = new CitizenBlockchain(blocks)
        blockchain.assertIsValid()
        if (!blockchain.isValidated()) return null
        return blockchain
    } catch {
        return null
    }
}

/**
 * PROTOCOL.md §5.3 step 3: the transaction must exist in the sender's own
 * history. Without this check anyone can sign a transaction carrying units
 * they never owned and inject phantom money.
 */
export function chainContainsTx(blockchain: InstanceType<typeof CitizenBlockchain>, txSignature: string): boolean {
    return blockchain.getHistory().some((t: { signature: string }) => t.signature === txSignature)
}
