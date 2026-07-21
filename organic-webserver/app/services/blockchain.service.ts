import { Blockchain, CitizenBlockchain, BlockMaker, TransactionMaker } from 'organic-money/src/index.js';
import type { BlockWire, TxWire } from 'organic-protocol'

const SECRETKEY = process.env.ORGANIC_SECRET_KEY

export function validateBlockchain(blocks: BlockWire[]) {
    const blockchain = new CitizenBlockchain(blocks)
    if (! blockchain.isWaitingValidation()) {
        throw new Error(`Given blockchain isn't made for validation :  ${blocks}`)
    }
    blockchain.validateAccount(SECRETKEY)
    return blockchain.export()
}

export function updateLastBlock(blocks: BlockWire[], lastblock: BlockWire) {
    const madeLastblock = BlockMaker.make(lastblock)

    const blockchain = new CitizenBlockchain(blocks)

    if (blockchain.lastblock.previousHash !== madeLastblock.previousHash) {
        blockchain.addBlock(madeLastblock)
    } else {
        blockchain.blocks[0] = madeLastblock
    }
    return blockchain.export()
}

/**
 * The server signs as a referent (bills, genesis), not as the chain's owner —
 * `Blockchain.closeLastBlock` now asserts the signing key matches the chain
 * owner (organic-money 0.2.5), which is correct for a citizen closing their
 * own block but wrong here. Sign the block directly instead, as the library
 * itself does internally minus that ownership guard.
 */
export function signLastBlock(blocks: BlockWire[]) {
    const blockchain = new CitizenBlockchain(blocks)
    if (!!blockchain.lastblock.isSigned()) {
        throw new Error(`Given block is already signed.`)
    } else {
        blockchain.lastblock.sign(SECRETKEY)
    }
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
 * Load a citizen's SAVED chain and assert it is valid (PROTOCOL.md §5.3, step 2).
 * Returns null instead of throwing — call sites turn that into INVALID_CHAIN.
 */
export function loadValidChain(blocks: BlockWire[]) {
    try {
        const blockchain = new CitizenBlockchain(blocks)
        blockchain.assertIsValid()
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
