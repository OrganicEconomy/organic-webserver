import request from 'supertest';
import app from "../app.js";
import assert from "assert";
import { UsedPaper, Ecosystem } from "../app/models.js";
import { CitizenBlockchain, EcosystemBlockchain } from 'organic-money/src/index.js';
import { encryptEcosystemKey } from '../app/utils/ecosystem-key.util.js';

const SECRETKEY = process.env.ORGANIC_SECRET_KEY as string

function makePaper() {
    const bc = new CitizenBlockchain()
    const sk = bc.startBlockchain("Payer", new Date(), SECRETKEY)
    const referentBc = new CitizenBlockchain()
    referentBc.startBlockchain("Referent", new Date(), SECRETKEY)
    const referentPk = referentBc.getMyPublicKey()
    return bc.generatePaper(sk, 1, referentPk)
}

// A real DER-encoded SECP256K1 signature (hex) — length varies with r/s
// padding (observed 136-142 chars over 20000 samples), never a fixed value.
// Built from a real paper rather than a hand-typed constant so the fixture
// can't silently drift out of sync with what the crypto lib actually produces.
const validHash = makePaper().signature

function flipLastChar(hash: string): string {
    return hash.slice(0, -1) + (hash.slice(-1) === '0' ? '1' : '0')
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

    it('Should return 404 for a real, unknown paper hash.', (done) => {
        request(app)
            .get('/api/papers/isCashed?hash=' + flipLastChar(validHash))
            .set('Accept', 'application/json')
            .expect(404, done)
    });

    it('Should return 400 for a hash that is too short.', (done) => {
        request(app)
            .get('/api/papers/isCashed?hash=' + validHash.slice(0, 40))
            .set('Accept', 'application/json')
            .expect(400)
            .end((err, response) => {
                if (err) return done(err);
                assert.equal(response.text, '{"message":"Invalid hash format."}')
                return done();
            });
    });

    it('Should return 400 for a hash that is too long.', (done) => {
        request(app)
            .get('/api/papers/isCashed?hash=' + validHash + "00".repeat(20))
            .set('Accept', 'application/json')
            .expect(400)
            .end((err, response) => {
                if (err) return done(err);
                assert.equal(response.text, '{"message":"Invalid hash format."}')
                return done();
            });
    });

    it('Should return 400 for a hash with an odd length (not valid hex).', (done) => {
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

    it('Should return 400 for a non-hex hash of a realistic length.', (done) => {
        request(app)
            .get('/api/papers/isCashed?hash=' + 'z'.repeat(validHash.length))
            .set('Accept', 'application/json')
            .expect(400)
            .end((err, response) => {
                if (err) return done(err);
                assert.equal(response.text, '{"message":"Invalid hash format."}')
                return done();
            });
    });

    it('Should return 200 with Id for a real, cashed paper hash.', (done) => {
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
        tampered.d = tampered.d + 1 // mutate after signing: signature no longer matches

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

    it("Should apply the paper's money to the target ecosystem's own chain when it is a known ecosystem.", async () => {
        const eco = new EcosystemBlockchain()
        const adminBc = new CitizenBlockchain()
        const adminSk = adminBc.startBlockchain("EcoAdmin2", new Date(), SECRETKEY)
        const ecoSk = eco.makeBirthBlock(null, adminBc.getMyPublicKey(), "Core2")
        eco.validateAccount(ecoSk)
        const ecoPk = eco.getMyPublicKey()
        await Ecosystem.create({
            publickey: ecoPk, name: "Core2", blocks: eco.export(),
            ecosk: await encryptEcosystemKey(ecoSk), iscore: false, validatorpk: adminBc.getMyPublicKey(),
        })

        const bc = new CitizenBlockchain()
        const sk = bc.startBlockchain("PaperMaker2", new Date(), SECRETKEY)
        bc.createMoneyAndInvests(sk)
        const paper = bc.generatePaper(sk, 1, ecoPk)

        await request(app)
            .post('/api/papers/cash')
            .send({ tx: paper.export() })
            .expect(200)

        const row = await Ecosystem.findOne({ where: { publickey: ecoPk } }) as any
        const reloaded = new EcosystemBlockchain(row.blocks)
        const cashedPaperTxs = reloaded.lastblock.transactions.filter((t: any) => t.type === 5)
        assert.equal(cashedPaperTxs.length, 1, "the ecosystem's own chain should record the cashed paper")
    });

    it('Should still register the hash only (legacy behavior) when the paper targets an unknown pk.', async () => {
        // The referent in makePaper() is just a random citizen pk, not a
        // registered Ecosystem row — this must not throw.
        const paper = makePaper()
        await request(app)
            .post('/api/papers/cash')
            .send({ tx: paper.export() })
            .expect(200)
    });
});
