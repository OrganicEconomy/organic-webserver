import request from 'supertest';
import app from "../app.js";
import assert from "assert";
import bcrypt from 'bcryptjs';
import { User, WaitingTx } from "../app/models.js";
import { Blockchain, CitizenBlockchain, BlockMaker, signHash } from 'organic-money/src/index.js';
import { dateToInt } from 'organic-money/src/crypto.js';

const TEST_SK = "ed945716dddb7af2c9774939e9946f1fee31f5ec0a3c6ec96059f119c396912f"
const TEST_PK = "02c85e4e448d67a8dc724c620f3fe7d2a3a3cce9fe905b918f712396b4f8effcb3"

function signBlock(blockObj, sk) {
    const block = BlockMaker.make(blockObj)
    block.merkle()
    return signHash(block.hash(), sk)
}

const SECRETKEY = process.env.ORGANIC_SECRET_KEY

describe('POST /users/login', () => {
    it('Should return json format.', (done) => {
        request(app)
            .post('/api/users/login')
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/, done)
    });

    it('Should return 404 for unknown user', (done) => {
        request(app)
            .post('/api/users/login')
            .set('Accept', 'application/json')
            .send({ mail: 'toto@toto.toto', password: 'didadou' })
            .expect(404, done)
    });

    it('Should return 200 and user for known user', async () => {
        const mail = "test3@test3.com"
        const password = "test3"
        await User.create({
            mail: mail,
            password: await bcrypt.hash(password, 10),
            publickey: "",
            name: "test3",
            secretkey: "",
            blocks: []
        });
        await request(app)
            .post('/api/users/login')
            .set('Accept', 'application/json')
            .send({ mail, password })
            .expect(200);
    });
});

describe('POST /users/register', () => {
    it('Should return json format.', (done) => {
        request(app)
            .post('/api/users/register')
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/, done)
    });

    it('Should return 400 for invalid blockchain.', (done) => {
        request(app)
            .post('/api/users/register')
            .set('Accept', 'application/json')
            .send({
                publickey: "a",
                name: "a",
                mail: "a",
                password: "a",
                secretkey: "a",
                blocks: []
            })
            .expect(400, done)
    });

    it('Should return 200 for valid blockchain.', (done) => {
        const bc = new CitizenBlockchain()
        const sk = "7201979f77794c943300a0070bb8320eccf57a68e10f0a667d8a5a075eb4dfcb"
        const pk = "0306ffd8f4fe843f5f7183179dcf36f550326813f56ec824911abca9c9d1cd7834"
        const birthdate = new Date(2012, 12, 28)
        const today = dateToInt(new Date())
        const name = "testName"
        bc.makeBirthBlock(name, birthdate, sk)
        const blocks = bc.export()

        request(app)
            .post('/api/users/register')
            .set('Accept', 'application/json')
            .send({
                publickey: pk,
                name: name,
                mail: "test@mail.com",
                password: "a",
                secretkey: sk,
                blocks: blocks
            })
            .expect(200)
            .end((err, response) => {
                if (err) return done(err);
                return done();
            });
    });
});

describe('PUT /users/save', () => {
    it('Should return json format.', (done) => {
        request(app)
            .put('/api/users/save')
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/, done)
    });

    it('Should return 404 for unknown user', async () => {
        const block = BlockMaker.make({ v: 1, d: 20260101, p: "abc", s: TEST_PK, r: "", m: [], i: [], t: 0, h: "", x: [] })
        block.merkle()
        const sig = signHash(block.hash(), TEST_SK)
        await request(app)
            .put('/api/users/save')
            .set('Accept', 'application/json')
            .set('x-signature', sig)
            .send({ publickey: TEST_PK, block: block.export() })
            .expect(404)
    });

    
    it('Should return 200 and add given new block.', async () => {
        const bc = new CitizenBlockchain()
        const sk = bc.startBlockchain("testName", new Date(), SECRETKEY)
        const pk = bc.getMyPublicKey()

        await User.create({
            mail: "test@test.test",
            password: "test",
            publickey: pk,
            name: "test",
            secretkey: sk,
            blocks: bc.export()
        })

        const expected = {
            v: 0,
            d: "20121212",
            p: "aaa",
            s: 'bbb',
            r: "root",
            m: [],
            i: [],
            t: 2000,
            h: "toto",
            x: []
        }

        const response = await request(app)
            .put('/api/users/save')
            .set('Accept', 'application/json')
            .set('x-signature', signBlock(expected, sk))
            .send({ publickey: pk, block: expected })
            .expect(200)

        const user = await User.findOne({ where: { publickey: pk } });
        assert.deepEqual(user.blocks[0], expected)
        assert.equal(user.blocks.length, 3)
    });

    it('Should remove WaitingTx included in the saved block.', async () => {
        const bc = new CitizenBlockchain()
        const sk = bc.startBlockchain("testName", new Date(), SECRETKEY)
        const pk = bc.getMyPublicKey()

        const bc2 = new CitizenBlockchain()
        const sk2 = bc2.startBlockchain("Payer", new Date(), SECRETKEY)
        const transaction = bc2.pay(sk2, pk, 1)

        await User.create({
            mail: "test@test.test",
            password: "test",
            publickey: pk,
            name: "test",
            secretkey: sk,
            blocks: bc.export()
        })

        const txExported = transaction.export()
        await WaitingTx.create({
            hash: txExported.h,
            target: pk,
            tx: txExported
        })

        bc.addTransaction(transaction)

        const lastblock = bc.lastblock.export()
        await request(app)
            .put('/api/users/save')
            .set('x-signature', signBlock(lastblock, sk))
            .send({ publickey: pk, block: lastblock })
            .expect(200)

        const waiting = await WaitingTx.findOne({ where: { hash: txExported.h } })
        assert.equal(waiting, null)
    });

    it('Should return 200 and update given new block if not new.', async () => {
        const bc = new CitizenBlockchain()
        const sk = bc.startBlockchain("testName", new Date(), SECRETKEY)
        const pk = bc.getMyPublicKey()
        bc.pay(sk, pk, 1)

        const bc2 = new CitizenBlockchain()
        const sk2 = bc2.startBlockchain("Payer", new Date(), SECRETKEY)
        const transaction = bc2.pay(sk2, pk, 1)

        await User.create({
            mail: "test@test.test",
            password: "test",
            publickey: pk,
            name: "test",
            secretkey: sk,
            blocks: bc.export()
        })

        bc.addTransaction(transaction)

        assert.equal(bc.blocks.length, 3)

        const lastblock = bc.lastblock.export()
        const response = await request(app)
            .put('/api/users/save')
            .set('Accept', 'application/json')
            .set('x-signature', signBlock(lastblock, sk))
            .send({ publickey: pk, block: lastblock })
            .expect(200)

        const user = await User.findOne({ where: { publickey: pk } });
        assert.equal(user.blocks.length, 3)
        assert.deepEqual(user.blocks, bc.export())
        assert.equal(user.blocks[0].x.length, 2)
    });
});

describe('PUT /users/sign', () => {
    it('Should return json format.', (done) => {
        request(app)
            .put('/api/users/sign')
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/, done)
    });

    it('Should return 404 for unknown user', async () => {
        const block = BlockMaker.make({ v: 1, d: 20260101, p: "abc", s: TEST_PK, r: "", m: [], i: [], t: 0, h: "", x: [] })
        block.merkle()
        const sig = signHash(block.hash(), TEST_SK)
        await request(app)
            .put('/api/users/sign')
            .set('Accept', 'application/json')
            .set('x-signature', sig)
            .send({ publickey: TEST_PK, block: block.export() })
            .expect(404)
    });

    it('Should return 500 as JSON when block is already signed.', async () => {
        const bc = new CitizenBlockchain()
        const sk = bc.startBlockchain("testName", new Date(), SECRETKEY)
        const pk = bc.getMyPublicKey()

        await User.create({
            mail: "test@test.test",
            password: "test",
            publickey: pk,
            name: "test",
            secretkey: sk,
            blocks: bc.export()
        })

        // blocks[0] after startBlockchain is the InitializationBlock, already signed by SECRETKEY
        const signedBlock = bc.export()[0]
        await request(app)
            .put('/api/users/sign')
            .set('Accept', 'application/json')
            .set('x-signature', signBlock(signedBlock, sk))
            .send({ publickey: pk, block: signedBlock })
            .expect(500)
            .expect('Content-Type', /json/)
    });

    it('Should return 200, update and sign given new block if not new.', async () => {
        const bc = new CitizenBlockchain()
        const sk = bc.startBlockchain("testName", new Date(), SECRETKEY)
        const pk = bc.getMyPublicKey()
        bc.pay(sk, pk, 1)

        const bc2 = new CitizenBlockchain()
        const sk2 = bc2.startBlockchain("Payer", new Date(), SECRETKEY)
        const transaction = bc2.pay(sk2, pk, 1)

        await User.create({
            mail: "test@test.test",
            password: "test",
            publickey: pk,
            name: "test",
            secretkey: sk,
            blocks: bc.export()
        })

        bc.addTransaction(transaction)

        assert.equal(bc.blocks.length, 3)

        const blockToSign = bc.export()[0]
        const response = await request(app)
            .put('/api/users/sign')
            .set('Accept', 'application/json')
            .set('x-signature', signBlock(blockToSign, sk))
            .send({ publickey: pk, block: blockToSign })
            .expect(200)

        const user = await User.findOne({ where: { publickey: pk } });
        assert.equal(user.blocks.length, 3)
        assert.ok(user.blocks[0].h)
        assert.equal(user.blocks[0].x.length, 2)
        assert.ok(new CitizenBlockchain(user.blocks).lastblock.isValid())
    });
});