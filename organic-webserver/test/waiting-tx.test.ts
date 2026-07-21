import request from 'supertest';
import app from "../app.js";
import assert from "assert";
import { WaitingTx, User } from "../app/models.js";
import { CitizenBlockchain } from 'organic-money/src/index.js';

const SECRETKEY = process.env.ORGANIC_SECRET_KEY as string

async function registerSender() {
    const bc = new CitizenBlockchain()
    const sk = bc.startBlockchain("Payer", new Date(), SECRETKEY)
    const pk = bc.getMyPublicKey()
    await User.create({
        mail: `${pk}@test.test`,
        password: "test",
        publickey: pk,
        name: "Payer",
        secretkey: sk,
        blocks: bc.export()
    })
    return { bc, sk, pk }
}

async function makeReceiver() {
    const bc = new CitizenBlockchain()
    bc.startBlockchain("Receiver", new Date(), SECRETKEY)
    return bc.getMyPublicKey()
}

describe('POST /tx/send', () => {
    it('Should return json format.', (done) => {
        request(app)
            .post('/api/tx/send')
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/, done)
    });

    it('Should return 400 for missing tx.', (done) => {
        request(app)
            .post('/api/tx/send')
            .set('Accept', 'application/json')
            .send({})
            .expect(400, done)
    });

    it('Should return 400 INVALID_TX for invalid transaction.', async () => {
        const res = await request(app)
            .post('/api/tx/send')
            .set('Accept', 'application/json')
            .send({ tx: { v: 1, d: 0, s: "fake", p: "fake", m: [], i: [], t: 0, h: "badsig", x: [] } })
            .expect(400)
        assert.equal(res.body.code, 'INVALID_TX')
    });

    it('Should return 403 UNKNOWN_SENDER if sender is not a registered user.', async () => {
        const bc = new CitizenBlockchain()
        const sk = bc.startBlockchain("Unknown", new Date(), SECRETKEY)
        const pk2 = await makeReceiver()

        const transaction = bc.pay(sk, pk2, 1)
        const res = await request(app)
            .post('/api/tx/send')
            .set('Accept', 'application/json')
            .send({ tx: transaction.export() })
            .expect(403)
        assert.equal(res.body.code, 'UNKNOWN_SENDER')
    });

    it('Should return 400 INVALID_CHAIN when the sender\'s saved chain is invalid.', async () => {
        const { bc, sk, pk } = await registerSender()
        const pk2 = await makeReceiver()
        const transaction = bc.pay(sk, pk2, 1)

        // Corrupt the saved chain after the fact (broken link).
        const corrupted = bc.export()
        corrupted[0].p = "not-the-real-previous-hash"
        await User.update({ blocks: corrupted }, { where: { publickey: pk } })

        const res = await request(app)
            .post('/api/tx/send')
            .set('Accept', 'application/json')
            .send({ tx: transaction.export() })
            .expect(400)
        assert.equal(res.body.code, 'INVALID_CHAIN')
    });

    it('Should return 404 TX_NOT_IN_CHAIN when the transaction was never saved by the sender.', async () => {
        // Registered, but the pay() below happens only in memory — never pushed via /save.
        // This is exactly the phantom-money attack PROTOCOL.md §5.3 step 3 exists to block.
        const { bc, sk } = await registerSender()
        const pk2 = await makeReceiver()
        const transaction = bc.pay(sk, pk2, 1)

        const res = await request(app)
            .post('/api/tx/send')
            .set('Accept', 'application/json')
            .send({ tx: transaction.export() })
            .expect(404)
        assert.equal(res.body.code, 'TX_NOT_IN_CHAIN')

        const saved = await WaitingTx.findOne({ where: { hash: transaction.export().h } })
        assert.equal(saved, null)
    });

    it('Should return 200 and save hash+target when the tx is present in the sender\'s saved chain.', async () => {
        const bc = new CitizenBlockchain()
        const sk = bc.startBlockchain("Payer", new Date(), SECRETKEY)
        const pk = bc.getMyPublicKey()
        const pk2 = await makeReceiver()

        // pay → save (simulated directly here) → send, the strict order the protocol requires.
        const transaction = bc.pay(sk, pk2, 1)
        const txExported = transaction.export()

        await User.create({
            mail: `${pk}@test.test`,
            password: "test",
            publickey: pk,
            name: "Payer",
            secretkey: sk,
            blocks: bc.export()
        })

        await request(app)
            .post('/api/tx/send')
            .set('Accept', 'application/json')
            .send({ tx: txExported })
            .expect(200)

        const saved = await WaitingTx.findOne({ where: { hash: txExported.h } }) as any
        assert.ok(saved, "WaitingTx should be findable by its hash (tx.h)")
        assert.equal(saved.target, txExported.p)
    });
});

describe('POST /tx/verify', () => {
    it('Should return json format.', (done) => {
        request(app)
            .post('/api/tx/verify')
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/, done)
    });

    it('Should return 400 for missing tx.', (done) => {
        request(app)
            .post('/api/tx/verify')
            .send({})
            .expect(400, done)
    });

    it('Should return status invalid for a malformed transaction.', async () => {
        const res = await request(app)
            .post('/api/tx/verify')
            .send({ tx: { v: 1, d: 0, s: "fake", p: "fake", m: [], i: [], t: 0, h: "badsig", x: [] } })
            .expect(200)
        assert.equal(res.body.status, 'invalid')
    });

    it('Should return status unknown-sender when the signer is not registered.', async () => {
        const bc = new CitizenBlockchain()
        const sk = bc.startBlockchain("Unknown", new Date(), SECRETKEY)
        const pk2 = await makeReceiver()
        const transaction = bc.pay(sk, pk2, 1)

        const res = await request(app)
            .post('/api/tx/verify')
            .send({ tx: transaction.export() })
            .expect(200)
        assert.equal(res.body.status, 'unknown-sender')
    });

    it('Should return status pending when the sender is known but has not saved the tx yet.', async () => {
        const { bc, sk } = await registerSender()
        const pk2 = await makeReceiver()
        const transaction = bc.pay(sk, pk2, 1)

        const res = await request(app)
            .post('/api/tx/verify')
            .send({ tx: transaction.export() })
            .expect(200)
        assert.equal(res.body.status, 'pending')
    });

    it('Should return status confirmed when the tx is in the sender\'s saved chain.', async () => {
        const bc = new CitizenBlockchain()
        const sk = bc.startBlockchain("Payer", new Date(), SECRETKEY)
        const pk = bc.getMyPublicKey()
        const pk2 = await makeReceiver()
        const transaction = bc.pay(sk, pk2, 1)

        await User.create({
            mail: `${pk}@test.test`,
            password: "test",
            publickey: pk,
            name: "Payer",
            secretkey: sk,
            blocks: bc.export()
        })

        const res = await request(app)
            .post('/api/tx/verify')
            .send({ tx: transaction.export() })
            .expect(200)
        assert.equal(res.body.status, 'confirmed')
    });
});
