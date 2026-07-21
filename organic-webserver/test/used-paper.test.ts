import request from 'supertest';
import app from "../app.js";
import assert from "assert";
import { UsedPaper } from "../app/models.js";
import { CitizenBlockchain } from 'organic-money/src/index.js';

const SECRETKEY = process.env.ORGANIC_SECRET_KEY as string
const validHash = "30450221008fd37a1a0b6fb7c974108a591ac5b1eb8fed8161dfd5f0a9d0c8b4aa0722da6d02200b0effdd13b841930500e3ef50e4bc941b304a845fac382e9360cfe4cbec5c8"

function makePaper() {
    const bc = new CitizenBlockchain()
    const sk = bc.startBlockchain("Payer", new Date(), SECRETKEY)
    const referentBc = new CitizenBlockchain()
    referentBc.startBlockchain("Referent", new Date(), SECRETKEY)
    const referentPk = referentBc.getMyPublicKey()
    return bc.generatePaper(sk, 1, referentPk)
}

describe('GET /isCashed', () => {
    it('Should return json format.', (done) => {
        request(app)
            .get('/api/papers/isCashed')
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/, done)
    });

    it('Should return 400 for no paper.', (done) => {
        request(app)
            .get('/api/papers/isCashed')
            .set('Accept', 'application/json')
            .expect(400)
            .expect({ message: "Content can not be empty!" }, done)
    });

    it('Should return 404 for unknown paper.', (done) => {
        request(app)
            .get('/api/papers/isCashed?hash=' + validHash.replace("a", "b"))
            .set('Accept', 'application/json')
            .expect(404, done)
    });

    it('Should return 400 if given hash is < 141 chars.', (done) => {
        request(app)
            .get('/api/papers/isCashed?hash=' + validHash.slice(0, -1))
            .set('Accept', 'application/json')
            .expect(400)
            .end((err, response) => {
                if (err) return done(err);
                assert.equal(response.text, '{"message":"Invalid hash format."}')
                return done();
            });
    });

    it('Should return 400 if given hash is > 141 chars.', (done) => {
        request(app)
            .get('/api/papers/isCashed?hash=' + validHash + "1")
            .set('Accept', 'application/json')
            .expect(400)
            .end((err, response) => {
                if (err) return done(err);
                assert.equal(response.text, '{"message":"Invalid hash format."}')
                return done();
            });
    });

    it('Should return 200 with Id for ok paper.', (done) => {
        UsedPaper.create({ hash: validHash })
            .then(() => {
                request(app)
                    .get('/api/papers/isCashed?hash=' + validHash)
                    .set('Accept', 'application/json')
                    .expect(200)
                    .expect(validHash, done)
            })
    });
});

describe('POST /cashPaper', () => {
    it('Should return json format.', (done) => {
        request(app)
            .post('/api/papers/cash')
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/, done)
    });

    it('Should return 400 for missing tx.', (done) => {
        request(app)
            .post('/api/papers/cash')
            .set('Accept', 'application/json')
            .send({})
            .expect(400, done)
    });

    it('Should return 400 INVALID_TX for a transaction with invalid crypto.', async () => {
        const paper = makePaper()
        const tampered = paper.export()
        tampered.m = [...tampered.m, 99999999999] // mutate after signing: signature no longer matches

        const res = await request(app)
            .post('/api/papers/cash')
            .send({ tx: tampered })
            .expect(400)
        assert.equal(res.body.code, 'INVALID_TX')
    });

    it('Should return 400 INVALID_TX when the transaction is not a PAPER.', async () => {
        const bc = new CitizenBlockchain()
        const sk = bc.startBlockchain("Payer", new Date(), SECRETKEY)
        const bc2 = new CitizenBlockchain()
        bc2.startBlockchain("Receiver", new Date(), SECRETKEY)
        const transaction = bc.pay(sk, bc2.getMyPublicKey(), 1)

        const res = await request(app)
            .post('/api/papers/cash')
            .send({ tx: transaction.export() })
            .expect(400)
        assert.equal(res.body.code, 'INVALID_TX')
    });

    it('Should register the hash and return 200 for a valid, uncashed paper.', async () => {
        const paper = makePaper()
        const exported = paper.export()

        await request(app)
            .post('/api/papers/cash')
            .send({ tx: exported })
            .expect(200)

        const stored = await UsedPaper.findOne({ where: { hash: exported.h } })
        assert.ok(stored, "the paper's hash (tx.h) should be registered as used")
    });

    it('Should return 409 ALREADY_CASHED for a paper already registered.', async () => {
        const paper = makePaper()
        const exported = paper.export()

        await request(app).post('/api/papers/cash').send({ tx: exported }).expect(200)

        const res = await request(app)
            .post('/api/papers/cash')
            .send({ tx: exported })
            .expect(409)
        assert.equal(res.body.code, 'ALREADY_CASHED')
    });
});
