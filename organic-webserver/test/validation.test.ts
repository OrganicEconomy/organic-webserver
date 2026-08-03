import request from 'supertest';
import app from "../app.js";
import assert from "assert";
import { User, Ecosystem } from "../app/models.js";
import { CitizenBlockchain, EcosystemBlockchain, BlockMaker, signHash, hashTimestampAuth } from 'organic-money/src/index.js';
import { encryptEcosystemKey } from '../app/utils/ecosystem-key.util.js';

const SECRETKEY = process.env.ORGANIC_SECRET_KEY as string

function signBlock(blockObj: object, sk: string) {
    const block = BlockMaker.make(blockObj)
    block.merkle()
    return signHash(block.hash(), sk)
}

/** A core ecosystem with one known admin, ready to approve/reject candidates. */
async function makeCoreWithAdmin() {
    const adminBc = new CitizenBlockchain()
    const adminSk = adminBc.startBlockchain("Admin", new Date(), SECRETKEY)
    const adminPk = adminBc.getMyPublicKey()

    const eco = new EcosystemBlockchain()
    const ecoSk = eco.makeBirthBlock(null, adminPk, "Core")
    eco.validateAccount(ecoSk)

    await Ecosystem.create({
        publickey: eco.getMyPublicKey(),
        name: "Core",
        blocks: eco.export(),
        ecosk: await encryptEcosystemKey(ecoSk),
        iscore: true,
        validatorpk: adminPk,
    })

    return { adminBc, adminSk, adminPk }
}

/** A candidate registered but not yet validated — a lone BirthBlock. */
async function makePendingCandidate(name = "Candidate") {
    const bc = new CitizenBlockchain()
    const sk = bc.makeBirthBlock(name, new Date(2000, 0, 1), null)
    const pk = bc.getMyPublicKey()
    await User.create({
        mail: `${pk}@test.test`,
        password: "test",
        publickey: pk,
        name,
        secretkey: sk,
        blocks: bc.export(),
        status: 'pending-validation',
    })
    return { bc, sk, pk }
}

function timestampAuth(pk: string, sk: string) {
    const ts = Math.floor(Date.now() / 1000)
    const sig = signHash(hashTimestampAuth(pk, ts), sk)
    return { ts, sig }
}

describe('GET /validations', () => {
    it('Should return 403 NOT_CORE_ADMIN for someone who is not a core admin.', async () => {
        await Ecosystem.destroy({ where: {}, truncate: true })
        const { adminPk } = await makeCoreWithAdmin()
        const notAdminBc = new CitizenBlockchain()
        const notAdminSk = notAdminBc.startBlockchain("NotAdmin", new Date(), SECRETKEY)
        const notAdminPk = notAdminBc.getMyPublicKey()
        const { ts, sig } = timestampAuth(notAdminPk, notAdminSk)

        const res = await request(app)
            .get('/api/v1/validations')
            .set('x-signature', sig)
            .query({ publickey: notAdminPk, timestamp: ts })
            .expect(403)
        assert.equal(res.body.code, 'NOT_CORE_ADMIN')
        void adminPk
    });

    it('Should list pending candidates for a core admin.', async () => {
        await Ecosystem.destroy({ where: {}, truncate: true })
        await User.destroy({ where: {}, truncate: true })
        const { adminSk, adminPk } = await makeCoreWithAdmin()
        const { pk: candidatePk } = await makePendingCandidate("Camille")
        const { ts, sig } = timestampAuth(adminPk, adminSk)

        const res = await request(app)
            .get('/api/v1/validations')
            .set('x-signature', sig)
            .query({ publickey: adminPk, timestamp: ts })
            .expect(200)

        assert.equal(res.body.length, 1)
        assert.equal(res.body[0].pk, candidatePk)
        assert.equal(res.body[0].name, "Camille")
        assert.ok(res.body[0].requestedAt)
    });
});

describe('GET /validations/:pk', () => {
    it('Should return the candidate blocks for a core admin.', async () => {
        await Ecosystem.destroy({ where: {}, truncate: true })
        const { adminSk, adminPk } = await makeCoreWithAdmin()
        const { pk: candidatePk, bc } = await makePendingCandidate()
        const { ts, sig } = timestampAuth(adminPk, adminSk)

        const res = await request(app)
            .get(`/api/v1/validations/${candidatePk}`)
            .set('x-signature', sig)
            .query({ publickey: adminPk, timestamp: ts })
            .expect(200)

        assert.equal(res.body.name, "Candidate")
        assert.deepEqual(res.body.blocks, bc.export())
    });

    it('Should return 404 for an unknown candidate.', async () => {
        await Ecosystem.destroy({ where: {}, truncate: true })
        const { adminSk, adminPk } = await makeCoreWithAdmin()
        const { ts, sig } = timestampAuth(adminPk, adminSk)

        await request(app)
            .get('/api/v1/validations/unknown-pk')
            .set('x-signature', sig)
            .query({ publickey: adminPk, timestamp: ts })
            .expect(404)
    });
});

describe('GET /validations/status/:pk', () => {
    it('Should return the status of a known account, no auth required.', async () => {
        const { pk } = await makePendingCandidate()

        const res = await request(app)
            .get(`/api/v1/validations/status/${pk}`)
            .expect(200)
        assert.equal(res.body.status, 'pending-validation')
    });

    it('Should return 404 for an unknown pk.', async () => {
        await request(app)
            .get('/api/v1/validations/status/unknown-pk')
            .expect(404)
    });
});

describe('POST /validations/:pk/approve', () => {
    it('Should return 401 without a valid block signature.', async () => {
        const { pk } = await makePendingCandidate()
        await request(app)
            .post(`/api/v1/validations/${pk}/approve`)
            .send({ publickey: "someone", block: { v: 1, d: 20260101, p: "aaa", s: "bbb", r: "", m: "", i: "", t: 4, e: 1, h: "", x: [] } })
            .expect(401)
    });

    it('Should return 403 NOT_CORE_ADMIN when the signer is not a core admin.', async () => {
        await Ecosystem.destroy({ where: {}, truncate: true })
        await makeCoreWithAdmin()
        const { pk } = await makePendingCandidate()

        const notAdminBc = new CitizenBlockchain()
        const notAdminSk = notAdminBc.startBlockchain("NotAdmin", new Date(), SECRETKEY)
        const notAdminPk = notAdminBc.getMyPublicKey()

        const candidateBc = new CitizenBlockchain((await User.findOne({ where: { publickey: pk } }) as any).blocks)
        const initBlock = candidateBc.validateAccount(notAdminSk)
        const exported = initBlock.export()

        const res = await request(app)
            .post(`/api/v1/validations/${pk}/approve`)
            .set('x-signature', signHash(initBlock.hash(), notAdminSk))
            .send({ publickey: notAdminPk, block: exported })
            .expect(403)
        assert.equal(res.body.code, 'NOT_CORE_ADMIN')
    });

    it('Should validate the candidate when signed by a real core admin.', async () => {
        await Ecosystem.destroy({ where: {}, truncate: true })
        const { adminSk, adminPk } = await makeCoreWithAdmin()
        const { pk } = await makePendingCandidate()

        const candidateBc = new CitizenBlockchain((await User.findOne({ where: { publickey: pk } }) as any).blocks)
        const initBlock = candidateBc.validateAccount(adminSk)
        const exported = initBlock.export()

        await request(app)
            .post(`/api/v1/validations/${pk}/approve`)
            .set('x-signature', signHash(initBlock.hash(), adminSk))
            .send({ publickey: adminPk, block: exported })
            .expect(200)

        const user = await User.findOne({ where: { publickey: pk } }) as any
        assert.equal(user.status, 'active')
        assert.equal(user.validatorpk, adminPk)
        assert.equal(user.blocks.length, 2)

        const bc = new CitizenBlockchain(user.blocks)
        assert.equal(bc.isValidated(), true)
    });

    it('Should return 409 ALREADY_VALIDATED for an already-active account.', async () => {
        await Ecosystem.destroy({ where: {}, truncate: true })
        const { adminSk, adminPk } = await makeCoreWithAdmin()
        const activeBc = new CitizenBlockchain()
        const activeSk = activeBc.startBlockchain("AlreadyActive", new Date(), SECRETKEY)
        const activePk = activeBc.getMyPublicKey()
        await User.create({
            mail: `${activePk}@test.test`, password: "x", publickey: activePk,
            name: "AlreadyActive", secretkey: activeSk, blocks: activeBc.export(), status: 'active'
        })

        const block = { v: 1, d: 20260101, p: "aaa", s: adminPk, r: "", m: "", i: "", t: 4, e: 1, h: "", x: [] }
        const res = await request(app)
            .post(`/api/v1/validations/${activePk}/approve`)
            .set('x-signature', signBlock(block, adminSk))
            .send({ publickey: adminPk, block })
            .expect(409)
        assert.equal(res.body.code, 'ALREADY_VALIDATED')
    });
});

describe('POST /validations/:pk/reject', () => {
    it('Should return 403 NOT_CORE_ADMIN for a non-admin.', async () => {
        await Ecosystem.destroy({ where: {}, truncate: true })
        await makeCoreWithAdmin()
        const { pk } = await makePendingCandidate()
        const notAdminBc = new CitizenBlockchain()
        const notAdminSk = notAdminBc.startBlockchain("NotAdmin", new Date(), SECRETKEY)
        const notAdminPk = notAdminBc.getMyPublicKey()
        const { ts, sig } = timestampAuth(notAdminPk, notAdminSk)

        await request(app)
            .post(`/api/v1/validations/${pk}/reject`)
            .set('x-signature', sig)
            .send({ publickey: notAdminPk, timestamp: ts })
            .expect(403)
    });

    it('Should mark the account rejected without deleting it.', async () => {
        await Ecosystem.destroy({ where: {}, truncate: true })
        const { adminSk, adminPk } = await makeCoreWithAdmin()
        const { pk } = await makePendingCandidate()
        const { ts, sig } = timestampAuth(adminPk, adminSk)

        await request(app)
            .post(`/api/v1/validations/${pk}/reject`)
            .set('x-signature', sig)
            .send({ publickey: adminPk, timestamp: ts })
            .expect(200)

        const user = await User.findOne({ where: { publickey: pk } }) as any
        assert.ok(user, "row must still exist")
        assert.equal(user.status, 'rejected')
    });
});
