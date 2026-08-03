import request from 'supertest';
import app from "../app.js";
import assert from "assert";
import { User, Ecosystem } from "../app/models.js";
import { CitizenBlockchain, EcosystemBlockchain, signHash, hashTimestampAuth } from 'organic-money/src/index.js';

const SECRETKEY = process.env.ORGANIC_SECRET_KEY as string

async function makeActiveCitizen(name: string) {
    const bc = new CitizenBlockchain()
    const sk = bc.startBlockchain(name, new Date(), SECRETKEY)
    const pk = bc.getMyPublicKey()
    await User.create({
        mail: `${pk}@test.test`, password: "test", publickey: pk,
        name, secretkey: sk, blocks: bc.export(), status: 'active'
    })
    return { sk, pk }
}

function timestampAuth(pk: string, sk: string) {
    const ts = Math.floor(Date.now() / 1000)
    const sig = signHash(hashTimestampAuth(pk, ts), sk)
    return { ts, sig }
}

describe('POST /ecosystems', () => {
    it('Should return 401 for an unauthenticated request (missing signature).', async () => {
        await request(app)
            .post('/api/v1/ecosystems')
            .send({})
            .expect(401)
    });

    it('Should return 401 for a request whose signature does not match.', async () => {
        const { pk } = await makeActiveCitizen("Founder1")
        await request(app)
            .post('/api/v1/ecosystems')
            .send({ founderPk: pk, timestamp: Math.floor(Date.now() / 1000), name: "Boulangerie" })
            .expect(401)
    });

    it('Should return 400 for a missing name, once authenticated.', async () => {
        const { pk, sk } = await makeActiveCitizen("FounderNoName")
        const { ts, sig } = timestampAuth(pk, sk)
        await request(app)
            .post('/api/v1/ecosystems')
            .set('x-signature', sig)
            .send({ founderPk: pk, timestamp: ts })
            .expect(400)
    });

    it("Should return 403 UNKNOWN_USER when the founder isn't an active citizen.", async () => {
        const bc = new CitizenBlockchain()
        const sk = bc.makeBirthBlock("Pending", new Date(), null)
        const pk = bc.getMyPublicKey()
        await User.create({
            mail: `${pk}@test.test`, password: "test", publickey: pk,
            name: "Pending", secretkey: sk, blocks: bc.export(), status: 'pending-validation'
        })
        const auth = timestampAuth(pk, sk)

        const res = await request(app)
            .post('/api/v1/ecosystems')
            .set('x-signature', auth.sig)
            .send({ founderPk: pk, timestamp: auth.ts, name: "Boulangerie" })
            .expect(403)
        assert.equal(res.body.code, 'UNKNOWN_USER')
    });

    it('Should create the ecosystem with the founder as admin, and make the first one the core.', async () => {
        await Ecosystem.destroy({ where: {}, truncate: true })
        const { pk, sk } = await makeActiveCitizen("Founder2")
        const { ts, sig } = timestampAuth(pk, sk)

        const res = await request(app)
            .post('/api/v1/ecosystems')
            .set('x-signature', sig)
            .send({ founderPk: pk, timestamp: ts, name: "Boulangerie associative", description: "Pain bio", lat: 45.75, lng: 4.85 })
            .expect(200)

        assert.equal(res.body.iscore, true)
        assert.ok(res.body.publickey)
        assert.ok(res.body.blocks)

        const eco = new EcosystemBlockchain(res.body.blocks)
        assert.equal(eco.isAdmin(pk), true)
        assert.equal(eco.isActor(pk), true)
    });

    it('Should not make a second ecosystem the core.', async () => {
        await Ecosystem.destroy({ where: {}, truncate: true })
        const first = await makeActiveCitizen("Founder3")
        const auth1 = timestampAuth(first.pk, first.sk)
        await request(app)
            .post('/api/v1/ecosystems')
            .set('x-signature', auth1.sig)
            .send({ founderPk: first.pk, timestamp: auth1.ts, name: "First" })
            .expect(200)

        const second = await makeActiveCitizen("Founder4")
        const auth2 = timestampAuth(second.pk, second.sk)
        const res = await request(app)
            .post('/api/v1/ecosystems')
            .set('x-signature', auth2.sig)
            .send({ founderPk: second.pk, timestamp: auth2.ts, name: "Second" })
            .expect(200)

        assert.equal(res.body.iscore, false)
    });
});

describe('GET /ecosystems', () => {
    it('Should list created ecosystems, sorted by distance when lat/lng are given.', async () => {
        await Ecosystem.destroy({ where: {}, truncate: true })
        const near = await makeActiveCitizen("Near")
        const nearAuth = timestampAuth(near.pk, near.sk)
        await request(app).post('/api/v1/ecosystems').set('x-signature', nearAuth.sig)
            .send({ founderPk: near.pk, timestamp: nearAuth.ts, name: "Near", lat: 45.76, lng: 4.86 }).expect(200)

        const far = await makeActiveCitizen("Far")
        const farAuth = timestampAuth(far.pk, far.sk)
        await request(app).post('/api/v1/ecosystems').set('x-signature', farAuth.sig)
            .send({ founderPk: far.pk, timestamp: farAuth.ts, name: "Far", lat: 48.85, lng: 2.35 }).expect(200)

        const res = await request(app)
            .get('/api/v1/ecosystems')
            .query({ lat: 45.75, lng: 4.85 })
            .expect(200)

        assert.equal(res.body.length, 2)
        assert.equal(res.body[0].name, "Near")
        assert.equal(res.body[1].name, "Far")
        assert.ok(res.body[0].distanceKm < res.body[1].distanceKm)
    });
});

describe('GET /ecosystems/mine', () => {
    it('Should return 400 without a publickey.', async () => {
        await request(app).get('/api/v1/ecosystems/mine').expect(400)
    });

    it("Should list the ecosystems where the given key has a role.", async () => {
        await Ecosystem.destroy({ where: {}, truncate: true })
        const { pk, sk } = await makeActiveCitizen("Founder5")
        const auth = timestampAuth(pk, sk)
        await request(app).post('/api/v1/ecosystems').set('x-signature', auth.sig)
            .send({ founderPk: pk, timestamp: auth.ts, name: "Atelier vélo" }).expect(200)

        const res = await request(app)
            .get('/api/v1/ecosystems/mine')
            .query({ publickey: pk })
            .expect(200)

        assert.equal(res.body.length, 1)
        assert.equal(res.body[0].name, "Atelier vélo")
        assert.equal(res.body[0].role, 'admin')
    });
});

describe('GET /ecosystems/:pk', () => {
    it('Should return 404 for an unknown ecosystem.', async () => {
        await request(app).get('/api/v1/ecosystems/unknown-pk').expect(404)
    });

    it('Should return full info for a known ecosystem.', async () => {
        await Ecosystem.destroy({ where: {}, truncate: true })
        const { pk, sk } = await makeActiveCitizen("Founder6")
        const auth = timestampAuth(pk, sk)
        const created = await request(app).post('/api/v1/ecosystems').set('x-signature', auth.sig)
            .send({ founderPk: pk, timestamp: auth.ts, name: "Épicerie" }).expect(200)

        const res = await request(app)
            .get(`/api/v1/ecosystems/${created.body.publickey}`)
            .expect(200)

        assert.equal(res.body.name, "Épicerie")
        assert.deepEqual(res.body.blocks, created.body.blocks)
    });
});

describe('PUT /ecosystems/:pk/meta', () => {
    it('Should return 403 for a non-admin.', async () => {
        await Ecosystem.destroy({ where: {}, truncate: true })
        const { pk, sk } = await makeActiveCitizen("Founder7")
        const auth = timestampAuth(pk, sk)
        const created = await request(app).post('/api/v1/ecosystems').set('x-signature', auth.sig)
            .send({ founderPk: pk, timestamp: auth.ts, name: "Café" }).expect(200)

        const other = await makeActiveCitizen("NotAdmin")
        const otherAuth = timestampAuth(other.pk, other.sk)

        await request(app)
            .put(`/api/v1/ecosystems/${created.body.publickey}/meta`)
            .set('x-signature', otherAuth.sig)
            .send({ publickey: other.pk, timestamp: otherAuth.ts, name: "Hacked" })
            .expect(403)
    });

    it('Should update the metadata when called by an admin.', async () => {
        await Ecosystem.destroy({ where: {}, truncate: true })
        const { pk, sk } = await makeActiveCitizen("Founder8")
        const auth = timestampAuth(pk, sk)
        const created = await request(app).post('/api/v1/ecosystems').set('x-signature', auth.sig)
            .send({ founderPk: pk, timestamp: auth.ts, name: "Café" }).expect(200)

        const auth2 = timestampAuth(pk, sk)
        await request(app)
            .put(`/api/v1/ecosystems/${created.body.publickey}/meta`)
            .set('x-signature', auth2.sig)
            .send({ publickey: pk, timestamp: auth2.ts, description: "Torréfaction locale" })
            .expect(200)

        const row = await Ecosystem.findOne({ where: { publickey: created.body.publickey } }) as any
        assert.equal(row.description, "Torréfaction locale")
        assert.equal(row.name, "Café", "untouched fields should be unchanged")
    });
});
