import assert from "assert";

import { CitizenBlockchain, Blockchain } from 'organic-money/src/index.js';
import { validateBlockchain, updateLastBlock, signLastBlock } from "../app/services/blockchain.service.js"

const sk = "ed945716dddb7af2c9774939e9946f1fee31f5ec0a3c6ec96059f119c396912f"
const pk = "02c85e4e448d67a8dc724c620f3fe7d2a3a3cce9fe905b918f712396b4f8effcb3"

describe("validateBlockchain", function () {
  it.only("should return a 2 blocks blockchain", () => {
    const bc = new CitizenBlockchain()

    bc.makeBirthBlock(sk, new Date(1990, 4, 15), "Alice")
    console.log(bc.blocks[0].transactions)

    validateBlockchain(bc.blocks)

    assert.equal(bc.blocks.length, 2)
  });

  it("should raise error if blockchain is longer than 1 block", () => {
    const bc = new CitizenBlockchain()
    bc.startBlockchain("alice", new Date(), sk)

    assert.throws(() => validateBlockchain(bc))
  })

  it("should raise error if blockchain is empty", () => {
    const bc = new CitizenBlockchain()

    assert.throws(() => validateBlockchain(bc))
  })
});

describe("updateLastBlock", function () {
  let validBlockchain

  let newblock = {
    version: 1,
    closedate: 20000408,
    previousHash: 12,
    signer: 0,
    merkleroot: 0,
    money: [],
    invests: [],
    total: 0,
    hash: 0
  }

  const tx = {
			version: Blockchain.VERSION,
			date: 20250102,
			source: pk,
			target: pk,
			money: [20250102000, 20250102001, 20250102002, 20250102003],
			invests: [202501029000, 202501029001, 202501029002, 202501029003],
			type: Blockchain.TXTYPE.CREATE,
			signer: 0,
			hash: 0
		}

  beforeEach(() => {
    validBlockchain = new CitizenBlockchain()
    validBlockchain.startBlockchain("alice", new Date(2000, 1, 1), sk)
  });

  it("should do nothing if blocks are the same", () => {
    validBlockchain.newBlock()
    const block = validBlockchain.lastblock

    updateLastBlock(validBlockchain.blocks, block)

    assert.equal(validBlockchain.blocks.length, 3)
  });

  it("should update last block if the previous hash is the same", () => {
    validBlockchain.newBlock()
    const block = validBlockchain.lastblock
    const block2 = Object.assign({}, block);

    block2.transactions = [tx]

    updateLastBlock(validBlockchain.blocks, block2)

    assert.deepEqual(validBlockchain.lastblock.transactions[0], tx)
  });

  it("should add given block if last one was already signed", () => {
    validBlockchain.newBlock()
    validBlockchain.sealLastBlock(sk)

    updateLastBlock(validBlockchain.blocks, newblock)

    assert.equal(validBlockchain.blocks.length, 4)
  });

  it("should return the blockchain blocks array", () => {
    
    const result = updateLastBlock(validBlockchain.blocks, validBlockchain.lastblock)

    assert.equal(result.length, 2)
  });
});

describe("signLastBlock", function () {
  let validBlockchain

  beforeEach(() => {
    validBlockchain = new CitizenBlockchain()
    validBlockchain.startBlockchain("alice", new Date(2000, 1, 1), sk)
  });

  it("should do nothing if block is already signed", () => {
    const block2 = Object.assign({}, validBlockchain.lastblock);

    signLastBlock(validBlockchain.blocks)

    assert.deepEqual(validBlockchain.lastblock, block2)
  });

  it("should sign the block if not signed", () => {
    validBlockchain.newBlock()

    signLastBlock(validBlockchain.blocks)

    assert.ok(Blockchain.isValidBlock(validBlockchain.lastblock))
  });

  it("should return the blockchain blocks array", () => {
    
    const result = signLastBlock(validBlockchain.blocks)

    assert.equal(result.length, 2)
  });
});
