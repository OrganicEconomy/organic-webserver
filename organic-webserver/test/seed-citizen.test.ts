import assert from "assert";
import request from 'supertest';
import app from "../app.js";
import { CitizenBlockchain, BlockMaker, publicFromPrivate, signHash } from 'organic-money/src/index.js';
import { aesDecrypt } from 'organic-money/src/crypto.js';
import { User } from "../app/models.js";
import { loadValidChain } from "../app/services/blockchain.service.js";
import { seedCitizen, parseSeedArgs } from "../scripts/seed-citizen.js";

const MAIL = "seeded@test.test"
const PASSWORD = "pwd"

async function loadUser() {
    return await User.findOne({ where: { mail: MAIL } }) as any
}

async function loadChain() {
    return new CitizenBlockchain((await loadUser()).blocks)
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

function signBlock(blockObj: object, sk: string) {
    const block = BlockMaker.make(blockObj)
    block.merkle()
    return signHash(block.hash(), sk)
}

describe('seedCitizen', function () {
    this.timeout(60000)

    before(async () => {
        await seedCitizen({ name: "Seeded", mail: MAIL, password: PASSWORD, level: 20 })
    })

    it('should reach the requested level', async () => {
        const chain = await loadChain()

        assert.strictEqual(chain.getLevel(), 20)
    });

    it("should leave today's money available to spend", async () => {
        const chain = await loadChain()

        assert.strictEqual(chain.getAvailableMoneyAmount(), 20)
    });

    it('should produce a valid and validated chain', async () => {
        const user = await loadUser()

        assert.notStrictEqual(loadValidChain(user.blocks), null)
    });

    it('should let the citizen restore the account with the chosen mail and password', async () => {
        const res = await request(app)
            .post('/api/users/login')
            .send({ mail: MAIL, password: PASSWORD })
            .expect(200)

        const secretKey = await decryptSecretKey(res.body.secretkey, PASSWORD)

        assert.strictEqual(publicFromPrivate(secretKey), res.body.publickey)
    });

    it('should refuse a mail already used by another account', async () => {
        await assert.rejects(
            seedCitizen({ name: "Duplicate", mail: MAIL, password: PASSWORD, level: 2 }),
            /already used/
        )

        assert.strictEqual(await User.count({ where: { mail: MAIL } }), 1)
    });

    it('should let the citizen save a new spending on top of the seeded history', async () => {
        const login = await request(app).post('/api/users/login').send({ mail: MAIL, password: PASSWORD })
        const secretKey = await decryptSecretKey(login.body.secretkey, PASSWORD)
        const chain = new CitizenBlockchain(login.body.blocks)
        chain.pay(secretKey, publicFromPrivate(process.env.ORGANIC_SECRET_KEY as string), 1)
        const block = chain.lastblock.export()

        await request(app)
            .put('/api/users/save')
            .set('x-signature', signBlock(block, secretKey))
            .send({ publickey: login.body.publickey, block, devicetoken: login.body.devicetoken })
            .expect(200)
    });
});

describe('parseSeedArgs', () => {
    it('should default the mail to <name>@mail.com and the password to "a"', () => {
        const options = parseSeedArgs(['--name=Jonnhy', '--level=20'])

        assert.deepStrictEqual(options, { name: "Jonnhy", mail: "jonnhy@mail.com", password: "a", level: 20 })
    });

    it('should keep the given mail and a password containing "="', () => {
        const options = parseSeedArgs(['--name=Alice', '--mail=alice@vrai.fr', '--password=a=b', '--level=20'])

        assert.deepStrictEqual(options, { name: "Alice", mail: "alice@vrai.fr", password: "a=b", level: 20 })
    });

    it('should require a name', () => {
        assert.throws(() => parseSeedArgs(['--level=20']), /--name is required/)
    });

    it('should require a positive integer level', () => {
        assert.throws(() => parseSeedArgs(['--name=Alice', '--level=zero']), /--level must be a positive integer/)
    });
});
