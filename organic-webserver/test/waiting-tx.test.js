import request from 'supertest';
import app from "../app.js";
import assert from "assert";
import { WaitingTx } from "../app/models.js";
import { CitizenBlockchain } from 'organic-money/src/index.js';

const SECRETKEY = process.env.ORGANIC_SECRET_KEY

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

    it('Should return 400 for invalid transaction.', (done) => {
        request(app)
            .post('/api/tx/send')
            .set('Accept', 'application/json')
            .send({ tx: { v: 1, d: 0, s: "fake", p: "fake", m: [], i: [], t: 0, h: "badsig", x: [] } })
            .expect(400, done)
    });

    it('Should save hash and target correctly in database.', async () => {
        const bc = new CitizenBlockchain()
        const sk = bc.startBlockchain("Payer", new Date(), SECRETKEY)

        const bc2 = new CitizenBlockchain()
        bc2.startBlockchain("Receiver", new Date(), SECRETKEY)
        const pk2 = bc2.getMyPublicKey()

        const transaction = bc.pay(sk, pk2, 1)
        const txExported = transaction.export()

        await request(app)
            .post('/api/tx/send')
            .set('Accept', 'application/json')
            .send({ tx: txExported })
            .expect(200)

        const saved = await WaitingTx.findOne({ where: { hash: txExported.h } })
        assert.ok(saved, "WaitingTx should be findable by its hash (tx.h)")
        assert.equal(saved.target, txExported.p)
    });
});
