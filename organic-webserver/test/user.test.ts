import request from 'supertest';
import app from "../app.js";
import assert from "assert";
import bcrypt from 'bcryptjs';
import { User, WaitingTx } from "../app/models.js";
import { CitizenBlockchain, BlockMaker, signHash, hashTimestampAuth } from 'organic-money/src/index.js';
import { dateToInt } from 'organic-money/src/crypto.js';

const TEST_SK = "ed945716dddb7af2c9774939e9946f1fee31f5ec0a3c6ec96059f119c396912f"
const TEST_PK = "02c85e4e448d67a8dc724c620f3fe7d2a3a3cce9fe905b918f712396b4f8effcb3"

function signBlock(blockObj: object, sk: string) {
    const block = BlockMaker.make(blockObj)
    block.merkle()
    return signHash(block.hash(), sk)
}

const SECRETKEY = process.env.ORGANIC_SECRET_KEY as string

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

    it('Should issue a devicetoken and revoke the previous one.', async () => {
        const mail = "device@test.test"
        const password = "test"
        const user = await User.create({
            mail: mail,
            password: await bcrypt.hash(password, 10),
            publickey: "device-test-pk",
            name: "test",
            secretkey: "",
            blocks: [],
            devicetoken: "old-device-token"
        }) as any;

        const res = await request(app)
            .post('/api/users/login')
            .set('Accept', 'application/json')
            .send({ mail, password })
            .expect(200);

        assert.ok(res.body.devicetoken)
        assert.notEqual(res.body.devicetoken, "old-device-token")

        const reloaded = await User.findOne({ where: { publickey: user.publickey } }) as any
        assert.equal(reloaded.devicetoken, res.body.devicetoken)
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
                birthdate: "1990-03-15",
                blocks: []
            })
            .expect(400, done)
    });

    it('Should return 200, a devicetoken and store birthdate + validatorpk for a valid blockchain.', async () => {
        const bc = new CitizenBlockchain()
        const sk = "7201979f77794c943300a0070bb8320eccf57a68e10f0a667d8a5a075eb4dfcb"
        const pk = "0306ffd8f4fe843f5f7183179dcf36f550326813f56ec824911abca9c9d1cd7834"
        const birthdate = new Date(2012, 11, 28)
        const name = "testName"
        bc.makeBirthBlock(name, birthdate, sk)
        const blocks = bc.export()

        const res = await request(app)
            .post('/api/users/register')
            .set('Accept', 'application/json')
            .send({
                publickey: pk,
                name: name,
                mail: "test@mail.com",
                password: "a",
                secretkey: sk,
                birthdate: "2012-12-28",
                blocks: blocks
            })
            .expect(200)

        assert.ok(res.body.devicetoken)
        assert.ok(res.body.blocks)

        const user = await User.findOne({ where: { publickey: pk } }) as any
        assert.equal(user.birthdate, "2012-12-28")
        assert.equal(user.devicetoken, res.body.devicetoken)
        assert.ok(user.validatorpk, "validatorpk should be recorded (this server, in Phase 1 open genesis)")
    });
});

describe('POST /users/password', () => {
    async function registerUser() {
        const bc = new CitizenBlockchain()
        const sk = bc.startBlockchain("testName", new Date(), SECRETKEY)
        const pk = bc.getMyPublicKey()
        await User.create({
            mail: "pwd@test.test",
            password: await bcrypt.hash("oldpassword", 10),
            publickey: pk,
            name: "test",
            secretkey: "encrypted-with-old-password",
            blocks: bc.export()
        })
        return { sk, pk }
    }

    it('Should return 401 without a valid timestamp signature.', async () => {
        const { pk } = await registerUser()
        await request(app)
            .post('/api/users/password')
            .send({ publickey: pk, timestamp: Math.floor(Date.now() / 1000), newpassword: "new", secretkey: "reencrypted" })
            .expect(401)
    });

    it('Should update bcrypt and the re-encrypted secretkey, without reading either.', async () => {
        const { sk, pk } = await registerUser()

        const ts = Math.floor(Date.now() / 1000)
        const sig = signHash(hashTimestampAuth(pk, ts), sk)

        await request(app)
            .post('/api/users/password')
            .set('x-signature', sig)
            .send({ publickey: pk, timestamp: ts, newpassword: "newpassword", secretkey: "encrypted-with-new-password" })
            .expect(200)

        const user = await User.findOne({ where: { publickey: pk } }) as any
        assert.equal(user.secretkey, "encrypted-with-new-password")
        assert.ok(await bcrypt.compare("newpassword", user.password))
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
        const block = BlockMaker.make({ v: 1, d: 20260101, p: "abc", s: TEST_PK, r: "", m: "", i: "", t: 0, h: "", x: [] })
        block.merkle()
        const sig = signHash(block.hash(), TEST_SK)
        await request(app)
            .put('/api/users/save')
            .set('Accept', 'application/json')
            .set('x-signature', sig)
            .send({ publickey: TEST_PK, block: block.export(), devicetoken: "irrelevant" })
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
            blocks: bc.export(),
            devicetoken: "current-device"
        })

        const expected = {
            v: 0,
            d: "20121212",
            p: "aaa",
            s: 'bbb',
            r: "root",
            m: "",
            i: "",
            t: 2000,
            h: "toto",
            x: []
        }

        await request(app)
            .put('/api/users/save')
            .set('Accept', 'application/json')
            .set('x-signature', signBlock(expected, sk))
            .send({ publickey: pk, block: expected, devicetoken: "current-device" })
            .expect(200)

        const user = await User.findOne({ where: { publickey: pk } }) as any
        assert.deepEqual(user.blocks[0], expected)
        assert.equal(user.blocks.length, 3)
    });

    it('Should return 409 DEVICE_REVOKED when the devicetoken is stale.', async () => {
        const bc = new CitizenBlockchain()
        const sk = bc.startBlockchain("testName", new Date(), SECRETKEY)
        const pk = bc.getMyPublicKey()

        await User.create({
            mail: "revoked@test.test",
            password: "test",
            publickey: pk,
            name: "test",
            secretkey: sk,
            blocks: bc.export(),
            devicetoken: "the-active-device"
        })

        const expected = { v: 0, d: "20121212", p: "aaa", s: 'bbb', r: "root", m: "", i: "", t: 2000, h: "toto", x: [] }

        const res = await request(app)
            .put('/api/users/save')
            .set('Accept', 'application/json')
            .set('x-signature', signBlock(expected, sk))
            .send({ publickey: pk, block: expected, devicetoken: "a-stale-device" })
            .expect(409)

        assert.equal(res.body.code, 'DEVICE_REVOKED')

        const user = await User.findOne({ where: { publickey: pk } }) as any
        assert.equal(user.blocks.length, 2, "the stale save must not be applied")
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
            blocks: bc.export(),
            devicetoken: "current-device"
        })

        const txExported = transaction.export()
        await WaitingTx.create({
            hash: txExported.h,
            target: pk,
            tx: txExported
        })

        bc.receivePay(transaction)

        const lastblock = bc.lastblock.export()
        await request(app)
            .put('/api/users/save')
            .set('x-signature', signBlock(lastblock, sk))
            .send({ publickey: pk, block: lastblock, devicetoken: "current-device" })
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
            blocks: bc.export(),
            devicetoken: "current-device"
        })

        bc.receivePay(transaction)

        assert.equal(bc.blocks.length, 3)

        const lastblock = bc.lastblock.export()
        await request(app)
            .put('/api/users/save')
            .set('Accept', 'application/json')
            .set('x-signature', signBlock(lastblock, sk))
            .send({ publickey: pk, block: lastblock, devicetoken: "current-device" })
            .expect(200)

        const user = await User.findOne({ where: { publickey: pk } }) as any
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
        const block = BlockMaker.make({ v: 1, d: 20260101, p: "abc", s: TEST_PK, r: "", m: "", i: "", t: 0, h: "", x: [] })
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

        bc.receivePay(transaction)

        assert.equal(bc.blocks.length, 3)

        const blockToSign = bc.export()[0]
        await request(app)
            .put('/api/users/sign')
            .set('Accept', 'application/json')
            .set('x-signature', signBlock(blockToSign, sk))
            .send({ publickey: pk, block: blockToSign })
            .expect(200)

        const user = await User.findOne({ where: { publickey: pk } }) as any
        assert.equal(user.blocks.length, 3)
        assert.ok(user.blocks[0].h)
        assert.equal(user.blocks[0].x.length, 2)
        assert.ok(new CitizenBlockchain(user.blocks).lastblock.isValid())
    });
});
