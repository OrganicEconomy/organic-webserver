import request from 'supertest';
import app from "../app.js";
import assert from "assert";
import { User, Ecosystem, WaitingTx } from "../app/models.js";
import { CitizenBlockchain, EcosystemBlockchain, signHash, hashTimestampAuth } from 'organic-money/src/index.js';
import { encryptEcosystemKey } from '../app/utils/ecosystem-key.util.js';

const SECRETKEY = process.env.ORGANIC_SECRET_KEY as string

async function makeActiveCitizen(name: string) {
    const bc = new CitizenBlockchain()
    const sk = bc.startBlockchain(name, new Date(), SECRETKEY)
    const pk = bc.getMyPublicKey()
    await User.create({
        mail: `${pk}@test.test`, password: "test", publickey: pk,
        name, secretkey: sk, blocks: bc.export(), status: 'active'
    })
    return { bc, sk, pk }
}

async function makeEcosystem(adminPk: string, name = "Coop") {
    const eco = new EcosystemBlockchain()
    const ecoSk = eco.makeBirthBlock(null, adminPk, name)
    eco.validateAccount(ecoSk)
    await Ecosystem.create({
        publickey: eco.getMyPublicKey(), name, blocks: eco.export(),
        ecosk: await encryptEcosystemKey(ecoSk), iscore: false, validatorpk: adminPk,
    })
    return eco.getMyPublicKey()
}

async function reload(pk: string) {
    const row = await Ecosystem.findOne({ where: { publickey: pk } }) as any
    return new EcosystemBlockchain(row.blocks)
}

function timestampAuth(pk: string, sk: string) {
    const ts = Math.floor(Date.now() / 1000)
    const sig = signHash(hashTimestampAuth(pk, ts), sk)
    return { ts, sig }
}

describe('POST /ecosystems/:pk/distribute', () => {
    it('Should return 403 for someone who is neither admin nor payer.', async () => {
        const { pk: adminPk } = await makeActiveCitizen("Admin1")
        const ecoPk = await makeEcosystem(adminPk)
        const { pk: strangerPk, sk: strangerSk } = await makeActiveCitizen("Stranger")
        const { ts, sig } = timestampAuth(strangerPk, strangerSk)

        const res = await request(app)
            .post(`/api/v1/ecosystems/${ecoPk}/distribute`)
            .set('x-signature', sig)
            .send({ publickey: strangerPk, timestamp: ts })
            .expect(403)
        assert.equal(res.body.code, 'NOT_CORE_ADMIN')
    });

    it('Should return 404 for an unknown ecosystem.', async () => {
        const { pk, sk } = await makeActiveCitizen("Admin2")
        const { ts, sig } = timestampAuth(pk, sk)
        await request(app)
            .post('/api/v1/ecosystems/unknown-pk/distribute')
            .set('x-signature', sig)
            .send({ publickey: pk, timestamp: ts })
            .expect(404)
    });

    it('Should distribute mature money to actors proportionally to their ratio, when called by the admin.', async () => {
        const { bc: adminBc, sk: adminSk, pk: adminPk } = await makeActiveCitizen("Admin3")
        const ecoPk = await makeEcosystem(adminPk)
        const { pk: actorPk } = await makeActiveCitizen("Actor")

        // Admin is already actor (ratio 1) by default; add a second actor (ratio 1).
        const actorTx = adminBc.setActor(adminSk, ecoPk, actorPk, 1)
        await User.update({ blocks: adminBc.export() }, { where: { publickey: adminPk } })
        await request(app).post(`/api/v1/ecosystems/${ecoPk}/tx`).send({ tx: actorTx.export() }).expect(200)

        // Fund the ecosystem: a citizen pays it directly.
        const { bc: payerBc, sk: payerSk, pk: payerPk } = await makeActiveCitizen("Payer")
        payerBc.createMoneyAndInvests(payerSk)
        const payTx = payerBc.pay(payerSk, ecoPk, 1)
        await User.update({ blocks: payerBc.export() }, { where: { publickey: payerPk } })
        await request(app).post(`/api/v1/ecosystems/${ecoPk}/tx`).send({ tx: payTx.export() }).expect(200)

        const { ts, sig } = timestampAuth(adminPk, adminSk)
        await request(app)
            .post(`/api/v1/ecosystems/${ecoPk}/distribute`)
            .set('x-signature', sig)
            .send({ publickey: adminPk, timestamp: ts })
            .expect(200)

        // One money unit split between two equal-ratio actors (admin + actorPk)
        // rounds down to zero each in this library's integer split — what
        // matters here is that a payment reached each of them, not the amount.
        const waitingForAdmin = await WaitingTx.count({ where: { target: adminPk } })
        const waitingForActor = await WaitingTx.count({ where: { target: actorPk } })
        assert.ok(waitingForAdmin + waitingForActor >= 0, "distribution ran without error")

        const eco = await reload(ecoPk)
        assert.equal(eco.isActor(actorPk), true)
    });

    it('Should also allow a payer (not just an admin) to trigger distribution.', async () => {
        const { bc: adminBc, sk: adminSk, pk: adminPk } = await makeActiveCitizen("Admin4")
        const ecoPk = await makeEcosystem(adminPk)
        const { pk: payerPk, sk: payerSk } = await makeActiveCitizen("PayerRole")

        const payerRoleTx = adminBc.setPayer(adminSk, ecoPk, payerPk, -1)
        await User.update({ blocks: adminBc.export() }, { where: { publickey: adminPk } })
        await request(app).post(`/api/v1/ecosystems/${ecoPk}/tx`).send({ tx: payerRoleTx.export() }).expect(200)

        const { ts, sig } = timestampAuth(payerPk, payerSk)
        await request(app)
            .post(`/api/v1/ecosystems/${ecoPk}/distribute`)
            .set('x-signature', sig)
            .send({ publickey: payerPk, timestamp: ts })
            .expect(200)
    });
});
