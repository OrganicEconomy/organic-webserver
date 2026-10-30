import request from 'supertest';
import app from "../app.js";
import assert from "assert";
import { UsedPaper, Ecosystem, User } from "../app/models.js";
import { CitizenBlockchain, EcosystemBlockchain, publicFromPrivate } from 'organic-money/src/index.js';
import { randomPrivateKey } from 'organic-money/src/crypto.js';
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

async function makeSavedPaper(targetPk?: string) {
    const bc = new CitizenBlockchain()
    const sk = bc.startBlockchain("PaperMaker", new Date(), SECRETKEY)
    const referentPk = targetPk ?? publicFromPrivate(randomPrivateKey())
    const paper = bc.generatePaper(sk, 1, referentPk)
    await User.create({
        mail: `${bc.getMyPublicKey()}@test.test`, password: "test", publickey: bc.getMyPublicKey(),
        name: "PaperMaker", secretkey: sk, blocks: bc.export(), status: 'active'
    })
    return paper
}

async function makeEcosystem(name: string) {
    const adminBc = new CitizenBlockchain()
    adminBc.startBlockchain(`${name}Admin`, new Date(), SECRETKEY)
    const eco = new EcosystemBlockchain()
    const ecoSk = eco.makeBirthBlock(null, adminBc.getMyPublicKey(), name)
    eco.validateAccount(ecoSk)
    await Ecosystem.create({
        publickey: eco.getMyPublicKey(), name, blocks: eco.export(),
        ecosk: await encryptEcosystemKey(ecoSk), iscore: false, validatorpk: adminBc.getMyPublicKey(),
    })
    return eco.getMyPublicKey()
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
        const paper = await makeSavedPaper()
        const exported = paper.export()

        await request(app)
            .post('/api/papers/cash')
            .send({ tx: exported })
            .expect(200)

        const stored = await UsedPaper.findOne({ where: { hash: exported.h } })
        assert.ok(stored, "the paper's hash (tx.h) should be registered as used")
    });

    it('Should return 409 ALREADY_CASHED for a paper already registered.', async () => {
        const paper = await makeSavedPaper()
        const exported = paper.export()

        await request(app).post('/api/papers/cash').send({ tx: exported }).expect(200)

        const res = await request(app)
            .post('/api/papers/cash')
            .send({ tx: exported })
            .expect(409)
        assert.equal(res.body.code, 'ALREADY_CASHED')
    });

    it("Should apply the paper's money to the target ecosystem's own chain when it is a known ecosystem.", async () => {
        const ecoPk = await makeEcosystem("Core2")
        const paper = await makeSavedPaper(ecoPk)

        await request(app)
            .post('/api/papers/cash')
            .send({ tx: paper.export() })
            .expect(200)

        const row = await Ecosystem.findOne({ where: { publickey: ecoPk } }) as any
        const reloaded = new EcosystemBlockchain(row.blocks)
        const cashedPaperTxs = reloaded.lastblock.transactions.filter((t: any) => t.type === 5)
        assert.equal(cashedPaperTxs.length, 1, "the ecosystem's own chain should record the cashed paper")
    });

    it('Should return 403 UNKNOWN_SENDER and credit nothing for a paper signed by an unregistered key.', async () => {
        const ecoPk = await makeEcosystem("Core3")
        const forger = new CitizenBlockchain()
        const forgerSk = forger.makeBirthBlock("Forger", new Date(), null)
        forger.validateAccount(forgerSk)
        const forgedPaper = forger.generatePaper(forgerSk, 1, ecoPk)

        const res = await request(app)
            .post('/api/papers/cash')
            .send({ tx: forgedPaper.export() })
            .expect(403)
        assert.equal(res.body.code, 'UNKNOWN_SENDER')

        assert.equal(await UsedPaper.findOne({ where: { hash: forgedPaper.signature } }), null)
        const row = await Ecosystem.findOne({ where: { publickey: ecoPk } }) as any
        assert.equal(new EcosystemBlockchain(row.blocks).lastblock.money.length, 0)
    });

    it("Should return 404 TX_NOT_IN_CHAIN for a paper missing from its issuer's saved chain.", async () => {
        const ecoPk = await makeEcosystem("Core4")
        const bc = new CitizenBlockchain()
        const sk = bc.startBlockchain("Issuer", new Date(), SECRETKEY)
        await User.create({
            mail: `${bc.getMyPublicKey()}@test.test`, password: "test", publickey: bc.getMyPublicKey(),
            name: "Issuer", secretkey: sk, blocks: bc.export(), status: 'active'
        })
        const unsavedPaper = bc.generatePaper(sk, 1, ecoPk)

        const res = await request(app)
            .post('/api/papers/cash')
            .send({ tx: unsavedPaper.export() })
            .expect(404)
        assert.equal(res.body.code, 'TX_NOT_IN_CHAIN')
    });

    it('Should still register the hash only (legacy behavior) when the paper targets an unknown pk.', async () => {
        // The referent is just a random pk, not a registered Ecosystem row — this must not throw.
        const paper = await makeSavedPaper()
        await request(app)
            .post('/api/papers/cash')
            .send({ tx: paper.export() })
            .expect(200)
    });
});
