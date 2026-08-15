import request from 'supertest';
import app from "../app.js";
import assert from "assert";
import { User, Ecosystem, WaitingTx } from "../app/models.js";
import { CitizenBlockchain, EcosystemBlockchain } from 'organic-money/src/index.js';
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

/** An ecosystem with a known admin (also actor+admin by default). */
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

describe('POST /ecosystems/:pk/tx', () => {
    it('Should return 400 for a missing tx.', async () => {
        const { pk: adminPk } = await makeActiveCitizen("Admin1")
        const ecoPk = await makeEcosystem(adminPk)
        await request(app).post(`/api/v1/ecosystems/${ecoPk}/tx`).send({}).expect(400)
    });

    it('Should return 400 INVALID_TX for a malformed transaction.', async () => {
        const { pk: adminPk } = await makeActiveCitizen("Admin2")
        const ecoPk = await makeEcosystem(adminPk)
        const res = await request(app)
            .post(`/api/v1/ecosystems/${ecoPk}/tx`)
            .send({ tx: { v: 1, d: 0, s: "fake", p: "fake", m: "", i: "", t: 0, h: "badsig", x: [] } })
            .expect(400)
        assert.equal(res.body.code, 'INVALID_TX')
    });

    it('Should return 400 INVALID_TX when the transaction targets a different ecosystem.', async () => {
        const { bc, sk, pk } = await makeActiveCitizen("Citizen1")
        const ecoPk = await makeEcosystem(pk)
        const otherEcoPk = await makeEcosystem(pk, "Other")
        bc.createMoneyAndInvests(sk)
        const tx = bc.engageInvests(sk, otherEcoPk, 1, 30)

        const res = await request(app)
            .post(`/api/v1/ecosystems/${ecoPk}/tx`)
            .send({ tx: tx.export() })
            .expect(400)
        assert.equal(res.body.code, 'INVALID_TX')
    });

    it('Should return 403 UNKNOWN_SENDER for an unregistered signer.', async () => {
        // Validated locally (so it has real invests to spend) but never
        // registered on this server (no User row) — that's the "unregistered" part.
        const other = new CitizenBlockchain()
        const otherSk = other.startBlockchain("Ghost", new Date(), SECRETKEY)
        const { pk: adminPk } = await makeActiveCitizen("Admin3")
        const ecoPk = await makeEcosystem(adminPk)
        other.createMoneyAndInvests(otherSk)
        const tx = other.engageInvests(otherSk, ecoPk, 1, 30)

        const res = await request(app)
            .post(`/api/v1/ecosystems/${ecoPk}/tx`)
            .send({ tx: tx.export() })
            .expect(403)
        assert.equal(res.body.code, 'UNKNOWN_SENDER')
    });

    it('Should return 404 TX_NOT_IN_CHAIN when the transaction was never saved.', async () => {
        const { bc, sk, pk } = await makeActiveCitizen("Citizen2")
        const ecoPk = await makeEcosystem(pk)
        bc.createMoneyAndInvests(sk)
        const tx = bc.engageInvests(sk, ecoPk, 1, 30)
        // Never saved via PUT /users/save — same phantom-money guard as tx/send.

        const res = await request(app)
            .post(`/api/v1/ecosystems/${ecoPk}/tx`)
            .send({ tx: tx.export() })
            .expect(404)
        assert.equal(res.body.code, 'TX_NOT_IN_CHAIN')
    });

    it('Should apply an ENGAGE (invests) transaction to the target ecosystem.', async () => {
        const { bc, sk, pk } = await makeActiveCitizen("Citizen3")
        const ecoPk = await makeEcosystem(pk)
        bc.createMoneyAndInvests(sk)
        // engageInvests(sk, target, dailyAmount, days) — 1/day for 30 days = 30 total.
        const tx = bc.engageInvests(sk, ecoPk, 1, 30)
        await User.update({ blocks: bc.export() }, { where: { publickey: pk } })

        await request(app)
            .post(`/api/v1/ecosystems/${ecoPk}/tx`)
            .send({ tx: tx.export() })
            .expect(200)

        const eco = await reload(ecoPk)
        assert.equal(eco.invests.length, 30)
    });

    it('Should apply a SETACTOR transaction signed by an admin.', async () => {
        const { pk: adminPk, sk: adminSk, bc: adminBc } = await makeActiveCitizen("Admin4")
        const ecoPk = await makeEcosystem(adminPk)
        const { pk: newActorPk } = await makeActiveCitizen("NewActor")

        const tx = adminBc.setActor(adminSk, ecoPk, newActorPk, 2)
        await User.update({ blocks: adminBc.export() }, { where: { publickey: adminPk } })

        await request(app)
            .post(`/api/v1/ecosystems/${ecoPk}/tx`)
            .send({ tx: tx.export() })
            .expect(200)

        const eco = await reload(ecoPk)
        assert.equal(eco.isActor(newActorPk), true)
        assert.equal(eco.getActors().get(newActorPk), 2)
    });

    it('Should execute a PAYERORDER immediately and queue the payment for a citizen beneficiary.', async () => {
        const { pk: adminPk, sk: adminSk, bc: adminBc } = await makeActiveCitizen("Admin5")
        const ecoPk = await makeEcosystem(adminPk)
        const { pk: supplierPk } = await makeActiveCitizen("Supplier")

        // Admin is already a payer? No — must be explicitly set, even though
        // also admin+actor by default (roles are independent).
        const payerTx = adminBc.setPayer(adminSk, ecoPk, adminPk, -1)
        await User.update({ blocks: adminBc.export() }, { where: { publickey: adminPk } })
        await request(app).post(`/api/v1/ecosystems/${ecoPk}/tx`).send({ tx: payerTx.export() }).expect(200)

        // Give the ecosystem some invests to draw from.
        const citizen = await makeActiveCitizen("Engager")
        citizen.bc.createMoneyAndInvests(citizen.sk)
        const engageTx = citizen.bc.engageInvests(citizen.sk, ecoPk, 1, 30)
        await User.update({ blocks: citizen.bc.export() }, { where: { publickey: citizen.pk } })
        await request(app).post(`/api/v1/ecosystems/${ecoPk}/tx`).send({ tx: engageTx.export() }).expect(200)

        const ecoAfterEngage = await reload(ecoPk)
        const investIds = ecoAfterEngage.invests.slice(0, 1)

        const orderTx = adminBc.payerOrder(adminSk, ecoPk, supplierPk, investIds)
        await User.update({ blocks: adminBc.export() }, { where: { publickey: adminPk } })

        await request(app)
            .post(`/api/v1/ecosystems/${ecoPk}/tx`)
            .send({ tx: orderTx.export() })
            .expect(200)

        const waiting = await WaitingTx.findAll({ where: { target: supplierPk } }) as any[]
        assert.equal(waiting.length, 1, "the resulting payment should be queued like a normal one — no separate claim step")
        assert.equal(waiting[0].tx.t, 13, "queued transaction should be an EARN (13)")
    });

    it('Should apply the payer-order payout directly when the beneficiary is another ecosystem on this server.', async () => {
        const { pk: adminPk, sk: adminSk, bc: adminBc } = await makeActiveCitizen("Admin6")
        const ecoPk = await makeEcosystem(adminPk, "Buyer")
        const supplierEcoPk = await makeEcosystem(adminPk, "Supplier co-op")

        const payerTx = adminBc.setPayer(adminSk, ecoPk, adminPk, -1)
        await User.update({ blocks: adminBc.export() }, { where: { publickey: adminPk } })
        await request(app).post(`/api/v1/ecosystems/${ecoPk}/tx`).send({ tx: payerTx.export() }).expect(200)

        const citizen = await makeActiveCitizen("Engager2")
        citizen.bc.createMoneyAndInvests(citizen.sk)
        const engageTx = citizen.bc.engageInvests(citizen.sk, ecoPk, 1, 30)
        await User.update({ blocks: citizen.bc.export() }, { where: { publickey: citizen.pk } })
        await request(app).post(`/api/v1/ecosystems/${ecoPk}/tx`).send({ tx: engageTx.export() }).expect(200)

        const ecoAfterEngage = await reload(ecoPk)
        const investIds = ecoAfterEngage.invests.slice(0, 1)

        const orderTx = adminBc.payerOrder(adminSk, ecoPk, supplierEcoPk, investIds)
        await User.update({ blocks: adminBc.export() }, { where: { publickey: adminPk } })

        await request(app)
            .post(`/api/v1/ecosystems/${ecoPk}/tx`)
            .send({ tx: orderTx.export() })
            .expect(200)

        const waiting = await WaitingTx.count({ where: { target: supplierEcoPk } })
        assert.equal(waiting, 0, "no waiting-list entry — applied directly since the server hosts both sides")

        const supplierEco = await reload(supplierEcoPk)
        const earnTxs = supplierEco.lastblock.transactions.filter((t: any) => t.type === 13)
        assert.equal(earnTxs.length, 1, "the supplier ecosystem's chain should directly record the EARN")
    });
});
