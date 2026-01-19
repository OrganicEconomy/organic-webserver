import { Blockchain, CitizenBlockchain } from 'organic-money/src/index.js';

const SECRETKEY = process.env.ORGANIC_SECRET_KEY

export function validateBlockchain(blocks) {
    const blockchain = new CitizenBlockchain(blocks)
    if (! blockchain.isWaitingValidation()) {
        throw new Error(`Given blockchain isn't made for validation :  ${blocks}`)
    }
    blockchain.validateAccount(SECRETKEY)
    return blockchain.blocks
}

export function updateLastBlock(blocks, lastblock) {
    const blockchain = new CitizenBlockchain(blocks)

    if (blockchain.lastblock.previousHash !== lastblock.previousHash) {
        blockchain.addBlock(lastblock)
    } else {
        blockchain.blocks[0] = lastblock
    }
    return blockchain.blocks
}

export function signLastBlock(blocks) {
    const blockchain = new CitizenBlockchain(blocks)
    if (!!blockchain.lastblock.hash) { // TODO: use Blockchain.isSigned(block)
        throw new Error(`Given block is already signed.`)
    } else {
        blockchain.sealLastBlock(SECRETKEY)
    }
    return blockchain.blocks
}

export function isValidTransaction(tx) {
    return Blockchain.isValidTransaction(tx)
}
