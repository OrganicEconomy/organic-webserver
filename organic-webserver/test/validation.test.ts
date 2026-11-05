import request from 'supertest';
import app from "../app.js";
import assert from "assert";
import { User, Ecosystem } from "../app/models.js";
import { CitizenBlockchain, EcosystemBlockchain } from 'organic-money/src/index.js';
import { encryptEcosystemKey } from '../app/utils/ecosystem-key.util.js';
import { signedRequest } from './helpers/request-auth.js';

const SECRETKEY = process.env.ORGANIC_SECRET_KEY as string

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

describe('GET /validations', () => {
    it('Should return 403 NOT_CORE_ADMIN for someone who is not a core admin.', async () => {
        await Ecosystem.destroy({ where: {}, truncate: true })
        const { adminPk } = await makeCoreWithAdmin()
        const notAdminBc = new CitizenBlockchain()
        const notAdminSk = notAdminBc.startBlockchain("NotAdmin", new Date(), SECRETKEY)
        const notAdminPk = notAdminBc.getMyPublicKey()
        const res = await signedRequest('get', '/api/v1/validations', notAdminSk)
            .expect(403)
        assert.equal(res.body.code, 'NOT_CORE_ADMIN')
        void adminPk
    });

    it('Should list pending candidates for a core admin.', async () => {
        await Ecosystem.destroy({ where: {}, truncate: true })
        await User.destroy({ where: {}, truncate: true })
        const { adminSk, adminPk } = await makeCoreWithAdmin()
        const { pk: candidatePk } = await makePendingCandidate("Camille")
        const res = await signedRequest('get', '/api/v1/validations', adminSk)
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
        const res = await signedRequest('get', `/api/v1/validations/${candidatePk}`, adminSk)
            .expect(200)

        assert.equal(res.body.name, "Candidate")
        assert.deepEqual(res.body.blocks, bc.export())
    });

    it('Should return 404 for an unknown candidate.', async () => {
        await Ecosystem.destroy({ where: {}, truncate: true })
        const { adminSk, adminPk } = await makeCoreWithAdmin()
        await signedRequest('get', '/api/v1/validations/unknown-pk', adminSk)
            .expect(404)
    });
});

describe('GET /validations/status/:pk', () => {
    it('Should return only the status of a known account, no auth required.', async () => {
        const { pk } = await makePendingCandidate()

        const res = await request(app)
            .get(`/api/v1/validations/status/${pk}`)
            .expect(200)
        assert.deepEqual(res.body, { status: 'pending-validation' })
    });

    it('Should return 404 for an unknown pk.', async () => {
        await request(app)
            .get('/api/v1/validations/status/unknown-pk')
            .expect(404)
    });
});

describe('GET /validations/mine', () => {
    it('Should return 401 without a request signature.', async () => {
        await makePendingCandidate()

        await request(app)
            .get('/api/v1/validations/mine')
            .expect(401)
    });

    it('Should return the status and blocks of the authenticated account.', async () => {
        const { pk, sk, bc } = await makePendingCandidate()
        const res = await signedRequest('get', '/api/v1/validations/mine', sk)
            .expect(200)

        assert.deepEqual(res.body, { status: 'pending-validation', blocks: bc.export() })
    });
});

describe('POST /validations/:pk/approve', () => {
    it('Should return 401 without a request signature.', async () => {
        const { pk } = await makePendingCandidate()
        await request(app)
            .post(`/api/v1/validations/${pk}/approve`)
            .send({ block: { v: 1, d: 20260101, p: "aaa", s: "bbb", r: "", m: "", i: "", t: 4, e: 1, h: "", x: [] } })
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

        const res = await signedRequest('post', `/api/v1/validations/${pk}/approve`, notAdminSk, { block: exported })
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

        await signedRequest('post', `/api/v1/validations/${pk}/approve`, adminSk, { block: exported })
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
        const res = await signedRequest('post', `/api/v1/validations/${activePk}/approve`, adminSk, { block })
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
        await signedRequest('post', `/api/v1/validations/${pk}/reject`, notAdminSk, {})
            .expect(403)
    });

    it('Should mark the account rejected without deleting it.', async () => {
        await Ecosystem.destroy({ where: {}, truncate: true })
        const { adminSk, adminPk } = await makeCoreWithAdmin()
        const { pk } = await makePendingCandidate()
        await signedRequest('post', `/api/v1/validations/${pk}/reject`, adminSk, {})
            .expect(200)

        const user = await User.findOne({ where: { publickey: pk } }) as any
        assert.ok(user, "row must still exist")
        assert.equal(user.status, 'rejected')
    });

    it('Should not let a non-admin reject in the name of an admin by naming their publickey.', async () => {
        await Ecosystem.destroy({ where: {}, truncate: true })
        const { adminPk } = await makeCoreWithAdmin()
        const { pk } = await makePendingCandidate()
        const strangerSk = "2222222222222222222222222222222222222222222222222222222222222222"

        await signedRequest('post', `/api/v1/validations/${pk}/reject`, strangerSk, {}, { publickey: adminPk })
            .expect(401)

        const user = await User.findOne({ where: { publickey: pk } }) as any
        assert.equal(user.status, 'pending-validation')
    });
});
