import request from 'supertest';
import app from "../app.js";
import assert from "assert";
import bcrypt from 'bcryptjs';
import { User, Ecosystem, WaitingTx } from "../app/models.js";
import { CitizenBlockchain, EcosystemBlockchain, BlockMaker } from 'organic-money/src/index.js';
import { dateToInt } from 'organic-money/src/crypto.js';
import { encryptEcosystemKey } from '../app/utils/ecosystem-key.util.js';
import { REQUEST_AUTH_HEADERS, type BlockWire } from 'organic-protocol';
import { signedRequest } from './helpers/request-auth.js';

const TEST_SK = "ed945716dddb7af2c9774939e9946f1fee31f5ec0a3c6ec96059f119c396912f"
const TEST_PK = "02c85e4e448d67a8dc724c620f3fe7d2a3a3cce9fe905b918f712396b4f8effcb3"

const SECRETKEY = process.env.ORGANIC_SECRET_KEY as string

async function registerActiveCitizen(bc: InstanceType<typeof CitizenBlockchain>, sk: string) {
    const pk = bc.getMyPublicKey()
    await User.create({
        mail: `${pk}@test.test`,
        password: "test",
        publickey: pk,
        name: "Active",
        secretkey: sk,
        blocks: bc.export(),
        devicetoken: "current-device",
    })
}

function registerNewCitizen(name: string) {
    const bc = new CitizenBlockchain()
    const sk = bc.makeBirthBlock(name, new Date(2000, 0, 1), null)
    return request(app)
        .post('/api/users/register')
        .send({
            publickey: bc.getMyPublicKey(),
            name,
            mail: `${name.toLowerCase()}@mail.com`,
            password: "a",
            secretkey: sk,
            blocks: bc.export(),
        })
}

async function averageLoginDuration(mail: string, password: string, attempts = 3) {
    const start = Date.now()
    for (let i = 0; i < attempts; i++) {
        await request(app).post('/api/users/login').send({ mail, password }).expect(404)
    }
    return (Date.now() - start) / attempts
}

async function registerPendingCitizen() {
    const bc = new CitizenBlockchain()
    const sk = bc.makeBirthBlock("Pending", new Date(), null)
    const pk = bc.getMyPublicKey()
    await User.create({
        mail: `${pk}@test.test`,
        password: "test",
        publickey: pk,
        name: "Pending",
        secretkey: sk,
        blocks: bc.export(),
        devicetoken: "current-device",
        status: 'pending-validation',
    })
    return { bc, sk, pk }
}

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

    it('Should find the account whatever the case and surrounding spaces of the given mail.', async () => {
        await registerNewCitizen("Casual").expect(200)

        await request(app)
            .post('/api/users/login')
            .send({ mail: " CASUAL@Mail.com ", password: "a" })
            .expect(200);
    });

    it('Should return 400 for a mail that is not a string.', async () => {
        await request(app)
            .post('/api/users/login')
            .send({ mail: { $ne: "" }, password: "a" })
            .expect(400);
    });

    it('Should take as long for an unknown mail as for a wrong password.', async () => {
        await registerNewCitizen("Timed").expect(200)

        const unknownMailDuration = await averageLoginDuration("nobody@mail.com", "a")
        const wrongPasswordDuration = await averageLoginDuration("timed@mail.com", "wrong")

        assert.ok(unknownMailDuration > wrongPasswordDuration / 2,
            `unknown mail answered in ${unknownMailDuration}ms, wrong password in ${wrongPasswordDuration}ms`)
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

    it('Should return 200, a devicetoken and store birthdate + validatorpk for the bootstrap (first-ever) account.', async () => {
        // Only the very first account on the server self-validates — see the
        // 'pending-validation' tests below for every account after it.
        await Ecosystem.destroy({ where: {}, truncate: true })
        await User.destroy({ where: {}, truncate: true })

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
        assert.equal(res.body.status, 'active')

        const user = await User.findOne({ where: { publickey: pk } }) as any
        assert.equal(user.birthdate, "2012-12-28")
        assert.equal(user.devicetoken, res.body.devicetoken)
        assert.equal(user.status, 'active')
        assert.ok(user.validatorpk, "validatorpk should be recorded (this server, bootstrap genesis)")
    });

    it('Should create the core ecosystem alongside the bootstrap account, with it as admin.', async () => {
        await Ecosystem.destroy({ where: {}, truncate: true })
        await User.destroy({ where: {}, truncate: true })

        const bc = new CitizenBlockchain()
        const sk = "7201979f77794c943300a0070bb8320eccf57a68e10f0a667d8a5a075eb4dfcb"
        const pk = "0306ffd8f4fe843f5f7183179dcf36f550326813f56ec824911abca9c9d1cd7834"
        bc.makeBirthBlock("Founder", new Date(2012, 11, 28), sk)

        await request(app)
            .post('/api/users/register')
            .set('Accept', 'application/json')
            .send({
                publickey: pk,
                name: "Founder",
                mail: "founder@mail.com",
                password: "a",
                secretkey: sk,
                birthdate: "2012-12-28",
                blocks: bc.export()
            })
            .expect(200)

        const cores = await Ecosystem.findAll({ where: { iscore: true } }) as any[]
        assert.equal(cores.length, 1)
        assert.equal(cores[0].validatorpk, pk)

        const eco = new EcosystemBlockchain(cores[0].blocks)
        assert.equal(eco.isValidated(), true)
        assert.ok(eco.isAdmin(pk), "the founder should be admin of the core ecosystem")
    });

    it('Should make only one of two simultaneous first registrations active.', async () => {
        await Ecosystem.destroy({ where: {}, truncate: true })
        await User.destroy({ where: {}, truncate: true })

        const responses = await Promise.all([registerNewCitizen("First"), registerNewCitizen("Second")])

        const statuses = responses.map(res => res.body.status).sort()
        assert.deepEqual(statuses, ['active', 'pending-validation'])
        assert.equal(await Ecosystem.count({ where: { iscore: true } }), 1)
    });

    it("Should return 200 with status 'pending-validation' and no validatorpk for any account after the first.", async () => {
        // Guarantee a non-bootstrap state deterministically, regardless of
        // what earlier tests in this run already created.
        await Ecosystem.destroy({ where: {}, truncate: true })
        await User.destroy({ where: {}, truncate: true })
        await User.create({
            mail: "already-here@test.test", password: "x", publickey: "already-here-pk",
            name: "Already here", secretkey: "x", blocks: [], status: 'active'
        })

        const bc = new CitizenBlockchain()
        const sk = "8201979f77794c943300a0070bb8320eccf57a68e10f0a667d8a5a075eb4dfcb"
        bc.makeBirthBlock("Candidate", new Date(2012, 11, 28), sk)
        const pk = bc.getMyPublicKey()

        const res = await request(app)
            .post('/api/users/register')
            .set('Accept', 'application/json')
            .send({
                publickey: pk,
                name: "Candidate",
                mail: "candidate@mail.com",
                password: "a",
                secretkey: sk,
                birthdate: "2012-12-28",
                blocks: bc.export()
            })
            .expect(200)

        assert.equal(res.body.status, 'pending-validation')

        const user = await User.findOne({ where: { publickey: pk } }) as any
        assert.equal(user.status, 'pending-validation')
        assert.equal(user.validatorpk, null)
        assert.equal(user.blocks.length, 1, "should stay a lone BirthBlock — no InitializationBlock until an admin approves it")

        // No second core ecosystem gets created for a non-bootstrap registration.
        const cores = await Ecosystem.count({ where: { iscore: true } })
        assert.equal(cores, 0)
    });

    it('Should refuse a publickey that is not the owner of the given blockchain.', async () => {
        const bc = new CitizenBlockchain()
        const sk = bc.makeBirthBlock("Impostor", new Date(2000, 0, 1), null)

        await request(app)
            .post('/api/users/register')
            .send({
                publickey: TEST_PK,
                name: "Impostor",
                mail: "impostor@mail.com",
                password: "a",
                secretkey: sk,
                blocks: bc.export(),
            })
            .expect(400)
        assert.equal(await User.count({ where: { publickey: TEST_PK } }), 0)
    });

    it('Should return 400 for a mail that is not a string.', async () => {
        const bc = new CitizenBlockchain()
        const sk = bc.makeBirthBlock("Listed", new Date(2000, 0, 1), null)
        await request(app)
            .post('/api/users/register')
            .send({
                publickey: bc.getMyPublicKey(),
                name: "Listed",
                mail: ["listed@mail.com"],
                password: "a",
                secretkey: sk,
                blocks: bc.export(),
            })
            .expect(400)
    });

    it('Should return 400 for a name longer than 100 characters.', async () => {
        const name = "N".repeat(101)
        const bc = new CitizenBlockchain()
        const sk = bc.makeBirthBlock(name, new Date(2000, 0, 1), null)
        await request(app)
            .post('/api/users/register')
            .send({
                publickey: bc.getMyPublicKey(),
                name,
                mail: "long-name@mail.com",
                password: "a",
                secretkey: sk,
                blocks: bc.export(),
            })
            .expect(400)
    });

    it('Should return 400 for a mail longer than 254 characters.', async () => {
        const bc = new CitizenBlockchain()
        const sk = bc.makeBirthBlock("LongMail", new Date(2000, 0, 1), null)
        await request(app)
            .post('/api/users/register')
            .send({
                publickey: bc.getMyPublicKey(),
                name: "LongMail",
                mail: `${"m".repeat(250)}@mail.com`,
                password: "a",
                secretkey: sk,
                blocks: bc.export(),
            })
            .expect(400)
    });

    it('Should refuse a mail already used by another account, whatever its case and surrounding spaces.', async () => {
        await registerNewCitizen("Taken").expect(200)

        const bc = new CitizenBlockchain()
        const sk = bc.makeBirthBlock("Copycat", new Date(2000, 0, 1), null)
        await request(app)
            .post('/api/users/register')
            .send({
                publickey: bc.getMyPublicKey(),
                name: "Copycat",
                mail: " TAKEN@mail.com ",
                password: "a",
                secretkey: sk,
                blocks: bc.export(),
            })
            .expect(409)
    });

    it('Should reject a non-bootstrap registration whose blockchain is already validated.', async () => {
        await Ecosystem.destroy({ where: {}, truncate: true })
        await User.destroy({ where: {}, truncate: true })
        await User.create({
            mail: "already-here2@test.test", password: "x", publickey: "already-here-pk-2",
            name: "Already here", secretkey: "x", blocks: [], status: 'active'
        })

        const bc = new CitizenBlockchain()
        const sk = bc.startBlockchain("Sneaky", new Date(), SECRETKEY)
        const pk = bc.getMyPublicKey()

        await request(app)
            .post('/api/users/register')
            .set('Accept', 'application/json')
            .send({
                publickey: pk,
                name: "Sneaky",
                mail: "sneaky@mail.com",
                password: "a",
                secretkey: sk,
                birthdate: "2012-12-28",
                blocks: bc.export()
            })
            .expect(400)
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

    it('Should return 401 without a request signature.', async () => {
        await registerUser()
        await request(app)
            .post('/api/users/password')
            .send({ newpassword: "new", secretkey: "reencrypted" })
            .expect(401)
    });

    it('Should update bcrypt and the re-encrypted secretkey, without reading either.', async () => {
        const { sk, pk } = await registerUser()

        await signedRequest('post', '/api/users/password', sk, { newpassword: "newpassword", secretkey: "encrypted-with-new-password" })
            .expect(200)

        const user = await User.findOne({ where: { publickey: pk } }) as any
        assert.equal(user.secretkey, "encrypted-with-new-password")
        assert.ok(await bcrypt.compare("newpassword", user.password))
    });

    it('Should return 400 and keep the stored secretkey for a secretkey that is not a string.', async () => {
        await User.destroy({ where: {}, truncate: true })
        const { sk, pk } = await registerUser()

        await signedRequest('post', '/api/users/password', sk, { newpassword: "newpassword", secretkey: { encrypted: true } })
            .expect(400)

        const user = await User.findOne({ where: { publickey: pk } }) as any
        assert.equal(user.secretkey, "encrypted-with-old-password")
    });

    it("Should not let an attacker change someone else's password by naming their publickey.", async () => {
        await User.destroy({ where: {}, truncate: true })
        const victim = await registerUser()
        const attackerSk = "1111111111111111111111111111111111111111111111111111111111111111"

        await signedRequest('post', '/api/users/password', attackerSk, { newpassword: "hacked", secretkey: "garbage" }, { publickey: victim.pk })
            .expect(401)

        const user = await User.findOne({ where: { publickey: victim.pk } }) as any
        assert.equal(user.secretkey, "encrypted-with-old-password")
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
        await signedRequest('put', '/api/users/save', TEST_SK, { block: block.export(), devicetoken: "irrelevant" })
            .expect(404)
    });

    it('Should return 200 and add given new block.', async () => {
        const bc = new CitizenBlockchain()
        const sk = bc.startBlockchain("testName", new Date(), SECRETKEY)
        const pk = bc.getMyPublicKey()

        // The server already has a closed block on top of genesis (e.g. from
        // an earlier save) — the citizen is now sending the *next* one.
        bc.newBlock()
        bc.closeLastBlock(sk)

        await User.create({
            mail: "test@test.test",
            password: "test",
            publickey: pk,
            name: "test",
            secretkey: sk,
            blocks: bc.export(),
            devicetoken: "current-device"
        })

        // A genuinely new block must chain onto the currently stored last
        // block rather than an arbitrary unrelated one — see the
        // gap-rejection test below for why.
        bc.newBlock()
        const expected = bc.lastblock.export()

        await signedRequest('put', '/api/users/save', sk, { block: expected, devicetoken: "current-device" })
            .expect(200)

        const user = await User.findOne({ where: { publickey: pk } }) as any
        assert.deepEqual(user.blocks[0], expected)
        assert.equal(user.blocks.length, 4)
    });

    it('Should reject a block that skips ahead of the currently stored last block (a block was lost in transit).', async () => {
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

        // Locally, close two blocks in a row without ever saving the first one
        // (e.g. offline, generating several paper bills back to back) — the
        // server only ever heard about the original open block.
        bc.newBlock()
        bc.closeLastBlock(sk)
        bc.newBlock()          // "skippedBlock" — closed locally, never saved to the server
        bc.closeLastBlock(sk)
        bc.newBlock()

        const toSend = bc.lastblock.export()
        await signedRequest('put', '/api/users/save', sk, { block: toSend, devicetoken: "current-device" })
            .expect(409)

        const user = await User.findOne({ where: { publickey: pk } }) as any
        assert.equal(user.blocks.length, 2, "the gapped save must not be applied")
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

        const res = await signedRequest('put', '/api/users/save', sk, { block: expected, devicetoken: "a-stale-device" })
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
        await signedRequest('put', '/api/users/save', sk, { block: lastblock, devicetoken: "current-device" })
            .expect(200)

        const waiting = await WaitingTx.findOne({ where: { hash: txExported.h } })
        assert.equal(waiting, null)
    });

    it('Should refuse a pending account validating itself with its own InitializationBlock.', async () => {
        const { bc, sk, pk } = await registerPendingCitizen()
        bc.validateAccount(sk)
        const selfSignedInitBlock = bc.lastblock.export()

        await signedRequest('put', '/api/users/save', sk, { block: selfSignedInitBlock, devicetoken: "current-device" })
            .expect(400)

        const user = await User.findOne({ where: { publickey: pk } }) as any
        assert.equal(user.blocks.length, 1)
    });

    it('Should refuse a version of the last block that drops an already saved payment.', async () => {
        const bc = new CitizenBlockchain()
        const sk = bc.startBlockchain("Payer", new Date(), SECRETKEY)
        const pk = bc.getMyPublicKey()
        const payment = bc.pay(sk, TEST_PK, 1)
        await registerActiveCitizen(bc, sk)

        const savedBlock: BlockWire = bc.lastblock.export()
        const rolledBackBlock = { ...savedBlock, x: savedBlock.x.filter(tx => tx.h !== payment.signature) }

        await signedRequest('put', '/api/users/save', sk, { block: rolledBackBlock, devicetoken: "current-device" })
            .expect(400)

        const user = await User.findOne({ where: { publickey: pk } }) as any
        assert.deepEqual(user.blocks[0], savedBlock)
    });

    it('Should refuse a block chaining onto nothing while the stored last block is still open.', async () => {
        const bc = new CitizenBlockchain()
        const sk = bc.startBlockchain("Payer", new Date(), SECRETKEY)
        const pk = bc.getMyPublicKey()
        bc.pay(sk, TEST_PK, 1)
        await registerActiveCitizen(bc, sk)

        const orphanBlock: BlockWire = { ...bc.lastblock.export(), p: null }

        await signedRequest('put', '/api/users/save', sk, { block: orphanBlock, devicetoken: "current-device" })
            .expect(409)
    });

    it('Should refuse a block that makes the chain invalid.', async () => {
        const bc = new CitizenBlockchain()
        const sk = bc.startBlockchain("Payer", new Date(), SECRETKEY)
        const pk = bc.getMyPublicKey()
        await registerActiveCitizen(bc, sk)
        const payment = bc.pay(sk, TEST_PK, 1)

        const block: BlockWire = bc.lastblock.export()
        const forgedBlock = { ...block, x: block.x.map(tx => tx.h === payment.signature ? { ...tx, p: pk } : tx) }

        await signedRequest('put', '/api/users/save', sk, { block: forgedBlock, devicetoken: "current-device" })
            .expect(400)

        const user = await User.findOne({ where: { publickey: pk } }) as any
        assert.equal(user.blocks.length, 2)
    });

    it('Should not let an older version of the last block overwrite a newer one saved at the same time.', async () => {
        const bc = new CitizenBlockchain()
        const sk = bc.startBlockchain("Racer", new Date(), SECRETKEY)
        const pk = bc.getMyPublicKey()
        await registerActiveCitizen(bc, sk)
        bc.pay(sk, TEST_PK, 1)
        const olderVersion: BlockWire = bc.lastblock.export()
        bc.setAdmin(sk, TEST_PK, TEST_PK)
        const newerVersion: BlockWire = bc.lastblock.export()

        await Promise.all([newerVersion, olderVersion].map(block =>
            signedRequest('put', '/api/users/save', sk, { block, devicetoken: "current-device" })
        ))

        const user = await User.findOne({ where: { publickey: pk } }) as any
        assert.equal(user.blocks[0].x.length, newerVersion.x.length)
    });

    it('Should refuse a block whose money holds ids no transaction brought into the wallet.', async () => {
        const bc = new CitizenBlockchain()
        const sk = bc.startBlockchain("Forger", new Date(), SECRETKEY)
        const pk = bc.getMyPublicKey()
        await registerActiveCitizen(bc, sk)
        bc.pay(sk, TEST_PK, 1)
        const inventedMoneyId = dateToInt(new Date()) * 1000 + 999
        bc.lastblock.money.push(inventedMoneyId)

        const forgedBlock: BlockWire = bc.lastblock.export()

        await signedRequest('put', '/api/users/save', sk, { block: forgedBlock, devicetoken: "current-device" })
            .expect(400)

        const user = await User.findOne({ where: { publickey: pk } }) as any
        assert.equal(user.blocks.length, 2)
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
        await signedRequest('put', '/api/users/save', sk, { block: lastblock, devicetoken: "current-device" })
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
        await signedRequest('put', '/api/users/sign', TEST_SK, { block: block.export() })
            .expect(404)
    });

    it('Should refuse to sign the InitializationBlock of a pending account validating itself.', async () => {
        const { bc, sk, pk } = await registerPendingCitizen()
        bc.validateAccount(sk)
        const selfSignedInitBlock = bc.lastblock.export()

        await signedRequest('put', '/api/users/sign', sk, { block: selfSignedInitBlock })
            .expect(403)

        const user = await User.findOne({ where: { publickey: pk } }) as any
        assert.equal(user.blocks.length, 1)
    });

    it("Should not let anyone authenticate with the public signature of a victim's closed block.", async () => {
        const victim = new CitizenBlockchain()
        const victimSk = victim.startBlockchain("Victim", new Date(), SECRETKEY)
        const victimPk = victim.getMyPublicKey()
        victim.pay(victimSk, TEST_PK, 1)
        victim.closeLastBlock(victimSk)
        await registerActiveCitizen(victim, victimSk)

        const publicBlock: BlockWire = victim.lastblock.export()
        const replayedBlock = { ...publicBlock, h: null }

        await request(app)
            .put('/api/users/sign')
            .set(REQUEST_AUTH_HEADERS.publickey, victimPk)
            .set(REQUEST_AUTH_HEADERS.timestamp, String(Math.floor(Date.now() / 1000)))
            .set(REQUEST_AUTH_HEADERS.nonce, '00112233445566778899aabbccddeeff')
            .set(REQUEST_AUTH_HEADERS.signature, publicBlock.h as string)
            .send({ block: replayedBlock })
            .expect(401)

        const user = await User.findOne({ where: { publickey: victimPk } }) as any
        assert.deepEqual(user.blocks[0], publicBlock)
    });

    it('Should refuse to sign for an account that is not active.', async () => {
        const bc = new CitizenBlockchain()
        const sk = bc.startBlockchain("Rejected", new Date(), SECRETKEY)
        const pk = bc.getMyPublicKey()
        bc.pay(sk, TEST_PK, 1)
        await registerActiveCitizen(bc, sk)
        await User.update({ status: 'rejected' }, { where: { publickey: pk } })

        const blockToSign = bc.lastblock.export()
        await signedRequest('put', '/api/users/sign', sk, { block: blockToSign })
            .expect(403)

        const user = await User.findOne({ where: { publickey: pk } }) as any
        assert.equal(user.blocks[0].s, null)
    });

});
