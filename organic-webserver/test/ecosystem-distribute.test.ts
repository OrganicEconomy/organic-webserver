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

/**
 * Account validation already grants 1 money unit dated at validation time
 * (see startBlockchain), so a same-day createMoneyAndInvests() call is a
 * no-op. To fund `amount` units, backdate validation by `amount - 1` days
 * (same trick as scripts/seed-test-accounts.ts) and let createMoneyAndInvests
 * fill the days from there up to today.
 */
async function makeFundedCitizen(name: string, amount: number) {
    const bc = new CitizenBlockchain()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - (amount - 1))
    const sk = bc.startBlockchain(name, startDate, SECRETKEY, null, startDate)
    const pk = bc.getMyPublicKey()
    await User.create({
        mail: `${pk}@test.test`, password: "test", publickey: pk,
        name, secretkey: sk, blocks: bc.export(), status: 'active'
    })
    bc.createMoneyAndInvests(sk)
    return { bc, sk, pk }
}

/** Same wire decoding as organic-money's crypto.js unpackUnitIds — the webserver only depends on the packed form. */
const UNIT_ID_BYTE_WIDTH = 5
function unpackUnitIds(packed: string): number[] {
    if (packed === '') return []
    const binary = atob(packed)
    const ids = []
    for (let offset = 0; offset < binary.length; offset += UNIT_ID_BYTE_WIDTH) {
        let id = 0
        for (let byte = 0; byte < UNIT_ID_BYTE_WIDTH; byte++) {
            id = id * 256 + binary.charCodeAt(offset + byte)
        }
        ids.push(id)
    }
    return ids
}

describe('POST /ecosystems/:pk/distribute', () => {
    it('Should return 403 for someone who is not an admin.', async () => {
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

    /**
     * Sets up an ecosystem with 2 equal-ratio actors (admin + a second actor,
     * total ratio 2) and funds it with `funded` money units. Shared by the
     * three round-accounting tests below.
     */
    async function setupTwoActorEcosystem(actorName: string, payerName: string, funded: number) {
        const { bc: adminBc, sk: adminSk, pk: adminPk } = await makeActiveCitizen(`${actorName}Admin`)
        const ecoPk = await makeEcosystem(adminPk)
        const { pk: actorPk } = await makeActiveCitizen(actorName)

        // Admin is already actor (ratio 1) by default; add a second actor (ratio 1).
        const actorTx = adminBc.setActor(adminSk, ecoPk, actorPk, 1)
        await User.update({ blocks: adminBc.export() }, { where: { publickey: adminPk } })
        await request(app).post(`/api/v1/ecosystems/${ecoPk}/tx`).send({ tx: actorTx.export() }).expect(200)

        const { bc: payerBc, sk: payerSk, pk: payerPk } = await makeFundedCitizen(payerName, funded)
        const payTx = payerBc.pay(payerSk, ecoPk, funded)
        await User.update({ blocks: payerBc.export() }, { where: { publickey: payerPk } })
        await request(app).post(`/api/v1/ecosystems/${ecoPk}/tx`).send({ tx: payTx.export() }).expect(200)

        return { adminPk, adminSk, actorPk, ecoPk }
    }

    it('Should not distribute anything when the funded amount is not enough for a full round.', async () => {
        // Total ratio is 2 (admin + actor); 1 unit funded is not enough for a round.
        const { adminPk, adminSk, actorPk, ecoPk } = await setupTwoActorEcosystem("Actor1", "Payer1", 1)

        const { ts, sig } = timestampAuth(adminPk, adminSk)
        await request(app)
            .post(`/api/v1/ecosystems/${ecoPk}/distribute`)
            .set('x-signature', sig)
            .send({ publickey: adminPk, timestamp: ts })
            .expect(200)

        const waitingForAdmin = await WaitingTx.count({ where: { target: adminPk } })
        const waitingForActor = await WaitingTx.count({ where: { target: actorPk } })
        assert.equal(waitingForAdmin, 0, "no payout should be sent to the admin")
        assert.equal(waitingForActor, 0, "no payout should be sent to the actor")

        const eco = await reload(ecoPk)
        assert.equal(eco.lastblock.money.length, 1, "the unspent unit should remain for the next round")
    });

    it('Should distribute exactly one round when the funded amount matches the total ratio.', async () => {
        // Total ratio is 2; 2 units funded make exactly 1 round (1 unit per actor).
        const { adminPk, adminSk, actorPk, ecoPk } = await setupTwoActorEcosystem("Actor2", "Payer2", 2)

        const { ts, sig } = timestampAuth(adminPk, adminSk)
        await request(app)
            .post(`/api/v1/ecosystems/${ecoPk}/distribute`)
            .set('x-signature', sig)
            .send({ publickey: adminPk, timestamp: ts })
            .expect(200)

        const adminWaiting = await WaitingTx.findOne({ where: { target: adminPk } }) as any
        const actorWaiting = await WaitingTx.findOne({ where: { target: actorPk } }) as any
        assert.ok(adminWaiting, "admin should receive a payout")
        assert.ok(actorWaiting, "actor should receive a payout")
        assert.equal(unpackUnitIds(adminWaiting.tx.m).length, 1)
        assert.equal(unpackUnitIds(actorWaiting.tx.m).length, 1)

        const eco = await reload(ecoPk)
        assert.equal(eco.lastblock.money.length, 0, "all funded money should have been distributed")
    });

    it('Should distribute only complete rounds and keep the remainder for a later round.', async () => {
        // Total ratio is 2; 5 units funded make 2 complete rounds (2 units per
        // actor) and leave 1 unit unspent for a future round.
        const { adminPk, adminSk, actorPk, ecoPk } = await setupTwoActorEcosystem("Actor3", "Payer3", 5)

        const { ts, sig } = timestampAuth(adminPk, adminSk)
        await request(app)
            .post(`/api/v1/ecosystems/${ecoPk}/distribute`)
            .set('x-signature', sig)
            .send({ publickey: adminPk, timestamp: ts })
            .expect(200)

        const adminWaiting = await WaitingTx.findOne({ where: { target: adminPk } }) as any
        const actorWaiting = await WaitingTx.findOne({ where: { target: actorPk } }) as any
        assert.equal(unpackUnitIds(adminWaiting.tx.m).length, 2, "2 rounds of 5/2 = 2 units per actor")
        assert.equal(unpackUnitIds(actorWaiting.tx.m).length, 2)

        const eco = await reload(ecoPk)
        assert.equal(eco.lastblock.money.length, 1, "1 unit should remain unspent, kept for a future round")
    });

    it('Should return 403 for a payer who is not an admin.', async () => {
        const { bc: adminBc, sk: adminSk, pk: adminPk } = await makeActiveCitizen("Admin4")
        const ecoPk = await makeEcosystem(adminPk)
        const { pk: payerPk, sk: payerSk } = await makeActiveCitizen("PayerRole")

        const payerRoleTx = adminBc.setPayer(adminSk, ecoPk, payerPk, -1)
        await User.update({ blocks: adminBc.export() }, { where: { publickey: adminPk } })
        await request(app).post(`/api/v1/ecosystems/${ecoPk}/tx`).send({ tx: payerRoleTx.export() }).expect(200)

        const { ts, sig } = timestampAuth(payerPk, payerSk)
        const res = await request(app)
            .post(`/api/v1/ecosystems/${ecoPk}/distribute`)
            .set('x-signature', sig)
            .send({ publickey: payerPk, timestamp: ts })
            .expect(403)
        assert.equal(res.body.code, 'NOT_CORE_ADMIN')
    });
});
