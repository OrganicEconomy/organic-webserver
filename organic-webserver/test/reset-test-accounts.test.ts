import assert from "assert";
import bcrypt from 'bcryptjs';
import request from 'supertest';
import app from "../app.js";
import { CitizenBlockchain, publicFromPrivate } from 'organic-money/src/index.js';
import { aesDecrypt } from 'organic-money/src/crypto.js';
import { User, Ecosystem, WaitingTx, UsedPaper, sequelize } from "../app/models.js";
import { resetTestAccounts, parseResetArgs, listAccountsToRecreate } from "../scripts/reset-citizens.js";
import { createEcosystem } from "../app/services/ecosystem.service.js";
import { isCoreAdmin } from "../app/services/validation.service.js";

async function createCitizen(name: string, mail: string, status: string) {
    const bc = new CitizenBlockchain()
    const sk = bc.startBlockchain(name, new Date(), process.env.ORGANIC_SECRET_KEY as string)
    await User.create({
        publickey: bc.getMyPublicKey(), name, mail, status,
        password: await bcrypt.hash("old", 10), secretkey: sk, blocks: bc.export(),
    })
}

function hexToBytes(hex: string): Uint8Array {
    return Uint8Array.from(hex.match(/../g)!.map((byte) => parseInt(byte, 16)))
}

async function decryptSecretKey(blob: string, password: string): Promise<string> {
    const parsed = JSON.parse(blob)
    const decrypted = await aesDecrypt({
        msg: hexToBytes(parsed.msg),
        iv: hexToBytes(parsed.iv),
        salt: hexToBytes(parsed.salt),
        verifier: hexToBytes(parsed.verifier),
    }, password)
    return Buffer.from(decrypted).toString('hex')
}

async function citizen(mail: string) {
    return await User.findOne({ where: { mail } }) as any
}

describe('resetTestAccounts', function () {
    this.timeout(60000)

    beforeEach(async () => {
        await sequelize.sync()
        await Promise.all([User, Ecosystem, WaitingTx, UsedPaper].map((model: any) => model.destroy({ where: {} })))
        await createCitizen("Alice", "alice@test.test", "active")
        await createCitizen("Bob", "bob@test.test", "active")
    })

    it('should recreate every active citizen with the same name and mail but a new key', async () => {
        const oldAlice = await citizen("alice@test.test")

        await resetTestAccounts({ adminMail: "alice@test.test", level: 2 })

        const alice = await citizen("alice@test.test")
        const bob = await citizen("bob@test.test")
        assert.strictEqual(alice.name, "Alice")
        assert.strictEqual(bob.name, "Bob")
        assert.notStrictEqual(alice.publickey, oldAlice.publickey)
    });

    it('should not recreate the accounts still pending validation', async () => {
        await createCitizen("Carol", "carol@test.test", "pending-validation")

        await resetTestAccounts({ adminMail: "alice@test.test", level: 2 })

        assert.strictEqual(await citizen("carol@test.test"), null)
    });

    it('should return for each mail a password that restores the account at the requested level', async () => {
        const credentials = await resetTestAccounts({ adminMail: "alice@test.test", level: 2 })

        const bobCredentials = credentials.find((credential) => credential.mail === "bob@test.test")!
        const login = await request(app).post('/api/users/login').send({ mail: bobCredentials.mail, password: bobCredentials.password }).expect(200)
        const secretKey = await decryptSecretKey(login.body.secretkey, bobCredentials.password)
        assert.strictEqual(publicFromPrivate(secretKey), login.body.publickey)
        assert.strictEqual(new CitizenBlockchain(login.body.blocks).getLevel(), 2)
    });

    it('should replace every ecosystem by a new core ecosystem administered by the new account of the admin mail', async () => {
        await createEcosystem((await citizen("bob@test.test")).publickey, "Old core")
        await createEcosystem((await citizen("bob@test.test")).publickey, "Old coop")

        await resetTestAccounts({ adminMail: "alice@test.test", level: 2 })

        const ecosystems = await Ecosystem.findAll() as any[]
        assert.strictEqual(ecosystems.length, 1)
        assert.strictEqual(ecosystems[0].iscore, true)
        assert.strictEqual(await isCoreAdmin((await citizen("alice@test.test")).publickey), true)
    });

    it('should refuse an admin mail that is not an active account, before deleting anything', async () => {
        const oldAlice = await citizen("alice@test.test")

        await assert.rejects(
            resetTestAccounts({ adminMail: "nobody@test.test", level: 2 }),
            /nobody@test.test is not an active account/
        )

        assert.strictEqual((await citizen("alice@test.test")).publickey, oldAlice.publickey)
    });

    it('should remove the waiting transactions and the cashed papers of the old accounts', async () => {
        await WaitingTx.create({ hash: "waiting-hash", target: "old-pk", tx: {} })
        await UsedPaper.create({ hash: "paper-hash" })

        await resetTestAccounts({ adminMail: "alice@test.test", level: 2 })

        assert.strictEqual(await WaitingTx.count(), 0)
        assert.strictEqual(await UsedPaper.count(), 0)
    });
});

describe('listAccountsToRecreate', () => {
    beforeEach(async () => {
        await sequelize.sync()
        await User.destroy({ where: {} })
        await createCitizen("Alice", "alice@test.test", "active")
        await createCitizen("Carol", "carol@test.test", "pending-validation")
    })

    it('should list the active accounts without changing anything', async () => {
        const oldAlice = await citizen("alice@test.test")

        assert.deepStrictEqual(await listAccountsToRecreate(), [{ name: "Alice", mail: "alice@test.test" }])
        assert.strictEqual((await citizen("alice@test.test")).publickey, oldAlice.publickey)
    });

    it('should list a single account per mail', async () => {
        await createCitizen("Alice bis", "alice@test.test", "active")

        assert.deepStrictEqual(await listAccountsToRecreate(), [{ name: "Alice", mail: "alice@test.test" }])
    });
});

describe('parseResetArgs', () => {
    it('should only preview the reset at level 20 unless asked otherwise', () => {
        assert.deepStrictEqual(parseResetArgs(['--admin-mail=alice@test.test']), { adminMail: "alice@test.test", level: 20, confirm: false })
    });

    it('should require an admin mail', () => {
        assert.throws(() => parseResetArgs(['--confirm']), /--admin-mail is required/)
    });

    it('should actually reset only when asked to confirm', () => {
        assert.strictEqual(parseResetArgs(['--admin-mail=alice@test.test', '--confirm']).confirm, true)
    });
});
