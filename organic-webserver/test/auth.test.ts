import assert from "assert";
import bcrypt from 'bcryptjs';
import { User } from "../app/models.js";
import { CitizenBlockchain, publicFromPrivate } from 'organic-money/src/index.js';
import { signedRequest } from './helpers/request-auth.js';

const SECRETKEY = process.env.ORGANIC_SECRET_KEY as string
const OTHER_SERVER_PK = publicFromPrivate("2222222222222222222222222222222222222222222222222222222222222222")
const NEW_PASSWORD = { newpassword: "stolen", secretkey: "attacker-blob" }

async function makeCitizen(name: string) {
    const bc = new CitizenBlockchain()
    const sk = bc.startBlockchain(name, new Date(), SECRETKEY)
    const pk = bc.getMyPublicKey()
    await User.create({
        mail: `${pk}@test.test`, password: await bcrypt.hash("oldpassword", 10), publickey: pk,
        name, secretkey: "encrypted-with-old-password", blocks: bc.export(), status: 'active'
    })
    return { sk, pk }
}

async function storedSecretKeyOf(pk: string) {
    const user = await User.findOne({ where: { publickey: pk } }) as any
    return user.secretkey
}

describe('requireRequestAuth', () => {
    it('Should not accept a signature made for another route.', async () => {
        const { sk, pk } = await makeCitizen("OtherRoute")

        await signedRequest('post', '/api/v1/users/password', sk, NEW_PASSWORD, { path: '/api/v1/tx/list' })
            .expect(401)
        assert.equal(await storedSecretKeyOf(pk), "encrypted-with-old-password")
    });

    it('Should not accept a signature made for another method.', async () => {
        const { sk, pk } = await makeCitizen("OtherMethod")

        await signedRequest('post', '/api/v1/users/password', sk, NEW_PASSWORD, { method: 'GET' })
            .expect(401)
        assert.equal(await storedSecretKeyOf(pk), "encrypted-with-old-password")
    });

    it('Should not accept a signature made for another body.', async () => {
        const { sk, pk } = await makeCitizen("OtherBody")

        await signedRequest('post', '/api/v1/users/password', sk, NEW_PASSWORD, { body: '{"newpassword":"x","secretkey":"y"}' })
            .expect(401)
        assert.equal(await storedSecretKeyOf(pk), "encrypted-with-old-password")
    });

    it('Should not accept a signature made for another server.', async () => {
        const { sk, pk } = await makeCitizen("OtherServer")

        await signedRequest('post', '/api/v1/users/password', sk, NEW_PASSWORD, { serverPk: OTHER_SERVER_PK })
            .expect(401)
        assert.equal(await storedSecretKeyOf(pk), "encrypted-with-old-password")
    });

    it('Should not accept a timestamp out of tolerance.', async () => {
        const { sk, pk } = await makeCitizen("Expired")
        const tenMinutesAgo = Math.floor(Date.now() / 1000) - 600

        await signedRequest('post', '/api/v1/users/password', sk, NEW_PASSWORD, { timestamp: tenMinutesAgo })
            .expect(401)
        assert.equal(await storedSecretKeyOf(pk), "encrypted-with-old-password")
    });

    it('Should accept a signed request only once.', async () => {
        const { sk } = await makeCitizen("Replayed")
        const sameSignature = { timestamp: Math.floor(Date.now() / 1000), nonce: '00112233445566778899aabbccddeeff' }

        await signedRequest('post', '/api/v1/users/password', sk, NEW_PASSWORD, sameSignature).expect(200)
        const replay = await signedRequest('post', '/api/v1/users/password', sk, NEW_PASSWORD, sameSignature).expect(401)

        assert.equal(replay.body.code, 'REPLAYED_REQUEST')
    });
});
