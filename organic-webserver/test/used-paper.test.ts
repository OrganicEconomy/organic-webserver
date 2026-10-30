import request from 'supertest';
import app from "../app.js";
import assert from "assert";
import { UsedPaper, Ecosystem, User } from "../app/models.js";
import { CitizenBlockchain, EcosystemBlockchain, BlockMaker, TransactionMaker, signHash, publicFromPrivate } from 'organic-money/src/index.js';
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

async function registerCasher() {
    const bc = new CitizenBlockchain()
    const sk = bc.startBlockchain("Casher", new Date(), SECRETKEY)
    const pk = bc.getMyPublicKey()
    await User.create({
        mail: `${pk}@test.test`, password: "test", publickey: pk,
        name: "Casher", secretkey: sk, blocks: bc.export(), devicetoken: "casher-device", status: 'active'
    })
    return { bc, sk, pk }
}

function makeForgedPaper(targetPk: string) {
    const forger = new CitizenBlockchain()
    const forgerSk = forger.makeBirthBlock("Forger", new Date(), null)
    forger.validateAccount(forgerSk)
    return forger.generatePaper(forgerSk, 1, targetPk)
}

function cashThroughSign(casher: { bc: InstanceType<typeof CitizenBlockchain>, sk: string, pk: string }, paper: any) {
    casher.bc.cashPaper(TransactionMaker.make(paper.export()))
    const block = casher.bc.lastblock.export()
    return request(app)
        .put('/api/users/sign')
        .set('x-signature', signBlock(block, casher.sk))
        .send({ publickey: casher.pk, block })
}

function signBlock(blockObj: object, sk: string) {
    const block = BlockMaker.make(blockObj)
    block.merkle()
    return signHash(block.hash(), sk)
}

async function ecosystemMoney(ecoPk: string) {
    const row = await Ecosystem.findOne({ where: { publickey: ecoPk } }) as any
    return new EcosystemBlockchain(row.blocks).lastblock.money.length
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

describe('POST /papers/cash', () => {
    it('Should no longer exist: papers are cashed through PUT /users/sign only.', async () => {
        const paper = await makeSavedPaper()
        await request(app)
            .post('/api/papers/cash')
            .send({ tx: paper.export() })
            .expect(404)
    });
});

describe('PUT /users/sign (cashing papers)', () => {
    it('Should refuse to cash a paper signed by an unregistered key, and credit nothing.', async () => {
        const ecoPk = await makeEcosystem("Forged")
        const casher = await registerCasher()
        const forgedPaper = makeForgedPaper(ecoPk)

        const res = await cashThroughSign(casher, forgedPaper).expect(403)
        assert.equal(res.body.code, 'UNKNOWN_SENDER')

        assert.equal(await UsedPaper.findOne({ where: { hash: forgedPaper.signature } }), null)
        assert.equal(await ecosystemMoney(ecoPk), 0)
        const user = await User.findOne({ where: { publickey: casher.pk } }) as any
        assert.equal(user.blocks.length, 2, "the block holding the forged paper must not be saved")
    });

    it("Should refuse to cash a paper missing from its issuer's saved chain.", async () => {
        const ecoPk = await makeEcosystem("Unsaved")
        const casher = await registerCasher()
        const issuer = new CitizenBlockchain()
        const issuerSk = issuer.startBlockchain("Issuer", new Date(), SECRETKEY)
        await User.create({
            mail: `${issuer.getMyPublicKey()}@test.test`, password: "test", publickey: issuer.getMyPublicKey(),
            name: "Issuer", secretkey: issuerSk, blocks: issuer.export(), status: 'active'
        })
        const unsavedPaper = issuer.generatePaper(issuerSk, 1, ecoPk)

        const res = await cashThroughSign(casher, unsavedPaper).expect(404)
        assert.equal(res.body.code, 'TX_NOT_IN_CHAIN')
    });

    it('Should register a legitimate paper in the name of its casher, credit the ecosystem and sign with its key.', async () => {
        const ecoPk = await makeEcosystem("Legit")
        const casher = await registerCasher()
        const paper = await makeSavedPaper(ecoPk)

        await cashThroughSign(casher, paper).expect(200)

        const usedPaper = await UsedPaper.findOne({ where: { hash: paper.signature } }) as any
        assert.equal(usedPaper.casher, casher.pk)
        assert.equal(await ecosystemMoney(ecoPk), 1)
        const user = await User.findOne({ where: { publickey: casher.pk } }) as any
        assert.equal(user.blocks[0].s, ecoPk)
    });

    it('Should refuse a paper already cashed by another citizen (a photographed paper).', async () => {
        const ecoPk = await makeEcosystem("Photographed")
        const paper = await makeSavedPaper(ecoPk)
        await cashThroughSign(await registerCasher(), paper).expect(200)
        const photographer = await registerCasher()

        const res = await cashThroughSign(photographer, paper).expect(409)
        assert.equal(res.body.code, 'ALREADY_CASHED')

        assert.equal(await ecosystemMoney(ecoPk), 1)
        const user = await User.findOne({ where: { publickey: photographer.pk } }) as any
        assert.equal(user.blocks.length, 2)
    });

    it('Should cash a second paper added to the same open block as a first one already cashed by this citizen.', async () => {
        const ecoPk = await makeEcosystem("SecondPaper")
        const casher = await registerCasher()
        await cashThroughSign(casher, await makeSavedPaper(ecoPk)).expect(200)
        const secondPaper = await makeSavedPaper(ecoPk)

        await cashThroughSign(casher, secondPaper).expect(200)

        const usedPaper = await UsedPaper.findOne({ where: { hash: secondPaper.signature } }) as any
        assert.equal(usedPaper.casher, casher.pk)
        assert.equal(await ecosystemMoney(ecoPk), 2)
    });

    it('Should still let the casher save a longer unsigned version of the block the server signed.', async () => {
        const ecoPk = await makeEcosystem("LongerVersion")
        const casher = await registerCasher()
        await cashThroughSign(casher, await makeSavedPaper(ecoPk)).expect(200)

        const payer = new CitizenBlockchain()
        const payerSk = payer.startBlockchain("Payer", new Date(), SECRETKEY)
        casher.bc.receivePay(payer.pay(payerSk, casher.pk, 1))
        const longerBlock = casher.bc.lastblock.export()

        await request(app)
            .put('/api/users/save')
            .set('x-signature', signBlock(longerBlock, casher.sk))
            .send({ publickey: casher.pk, block: longerBlock, devicetoken: "casher-device" })
            .expect(200)

        const user = await User.findOne({ where: { publickey: casher.pk } }) as any
        assert.deepEqual(user.blocks[0], longerBlock)
    });

    it('Should refuse to save a block holding a paper that was never cashed through sign.', async () => {
        const ecoPk = await makeEcosystem("SavedOnly")
        const casher = await registerCasher()
        casher.bc.cashPaper(TransactionMaker.make(makeForgedPaper(ecoPk).export()))
        const block = casher.bc.lastblock.export()

        await request(app)
            .put('/api/users/save')
            .set('x-signature', signBlock(block, casher.sk))
            .send({ publickey: casher.pk, block, devicetoken: "casher-device" })
            .expect(400)

        const user = await User.findOne({ where: { publickey: casher.pk } }) as any
        assert.equal(user.blocks.length, 2)
    });

    it('Should register none of the papers of a block when one of them is refused.', async () => {
        const ecoPk = await makeEcosystem("Atomic")
        const casher = await registerCasher()
        const legitPaper = await makeSavedPaper(ecoPk)
        casher.bc.cashPaper(TransactionMaker.make(legitPaper.export()))

        await cashThroughSign(casher, makeForgedPaper(ecoPk)).expect(403)

        assert.equal(await UsedPaper.findOne({ where: { hash: legitPaper.signature } }), null)
        assert.equal(await ecosystemMoney(ecoPk), 0)
    });
});
