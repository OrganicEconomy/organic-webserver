import { Blockchain, CitizenBlockchain, BlockMaker } from 'organic-money/src/index.js';

const SECRETKEY = process.env.ORGANIC_SECRET_KEY

export function validateBlockchain(blocks) {
    const blockchain = new CitizenBlockchain(blocks)
    if (! blockchain.isWaitingValidation()) {
        throw new Error(`Given blockchain isn't made for validation :  ${blocks}`)
    }
    blockchain.validateAccount(SECRETKEY)
    return blockchain.export()
}

export function updateLastBlock(blocks, lastblock) {
    lastblock = BlockMaker.make(lastblock)
    
    const blockchain = new CitizenBlockchain(blocks)

    if (blockchain.lastblock.previousHash !== lastblock.previousHash) {
        blockchain.addBlock(lastblock)
    } else {
        blockchain.blocks[0] = lastblock
    }
    return blockchain.export()
}

export function signLastBlock(blocks) {
    const blockchain = new CitizenBlockchain(blocks)
    if (!!blockchain.lastblock.isSigned()) {
        throw new Error(`Given block is already signed.`)
    } else {
        blockchain.closeLastBlock(SECRETKEY)
    }
    return blockchain.export()
}

export function isValidTransaction(tx) {
    return tx.isValid()
}
