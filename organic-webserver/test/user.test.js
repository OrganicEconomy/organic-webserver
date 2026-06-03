import request from 'supertest';
import app from "../app.js";
import assert from "assert";
import bcrypt from 'bcryptjs';
import { User } from "../app/models.js";
import { Blockchain, CitizenBlockchain } from 'organic-money/src/index.js';
import { dateToInt } from 'organic-money/src/crypto.js';

const SECRETKEY = process.env.ORGANIC_SECRET_KEY

describe('POST /users/login', () => {
    it('Should return json format.', (done) => {
        request(app)
            .post('/api/users/login')
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/, done)
    });

    it('Should return 404 for unknown user', (done) => {
        request(app)
            .post('/api/users/login')
            .set('Accept', 'application/json')
            .send({ mail: 'toto@toto.toto', password: 'didadou' })
            .expect(404, done)
    });

    it('Should return 200 and user for known user', async () => {
        const mail = "test3@test3.com"
        const password = "test3"
        await User.create({
            mail: mail,
            password: await bcrypt.hash(password, 10),
            publickey: "",
            name: "test3",
            secretkey: "",
            blocks: []
        });
        await request(app)
            .post('/api/users/login')
            .set('Accept', 'application/json')
            .send({ mail, password })
            .expect(200);
    });
});

describe('POST /users/register', () => {
    it('Should return json format.', (done) => {
        request(app)
            .post('/api/users/register')
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/, done)
    });

    it('Should return 400 for invalid blockchain.', (done) => {
        request(app)
            .post('/api/users/register')
            .set('Accept', 'application/json')
            .send({
                publickey: "a",
                name: "a",
                mail: "a",
                password: "a",
                secretkey: "a",
                blocks: []
            })
            .expect(400, done)
    });

    it('Should return 200 for valid blockchain.', (done) => {
        const bc = new CitizenBlockchain()
        const sk = "7201979f77794c943300a0070bb8320eccf57a68e10f0a667d8a5a075eb4dfcb"
        const pk = "0306ffd8f4fe843f5f7183179dcf36f550326813f56ec824911abca9c9d1cd7834"
        const birthdate = new Date(2012, 12, 28)
        const today = dateToInt(new Date())
        const name = "testName"
        bc.makeBirthBlock(name, birthdate, sk)
        const blocks = bc.export()

        request(app)
            .post('/api/users/register')
            .set('Accept', 'application/json')
            .send({
                publickey: pk,
                name: name,
                mail: "test@mail.com",
                password: "a",
                secretkey: sk,
                blocks: blocks
            })
            .expect(200)
            .end((err, response) => {
                if (err) return done(err);
                return done();
            });
    });
});

describe('PUT /users/save', () => {
    it('Should return json format.', (done) => {
        request(app)
            .put('/api/users/save')
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/, done)
    });

    it('Should return 404 for unknown user', (done) => {
        request(app)
            .put('/api/users/save')
            .set('Accept', 'application/json')
            .send({
                publickey: "1206ffd8f4fe843f5f7183179dcf36f550326813f56ec824911abca9c9d1cd7834",
                block: []
            })
            .expect(404, done)
    });

    
    it('Should return 200 and add given new block.', async () => {
        const bc = new CitizenBlockchain()
        const sk = bc.startBlockchain("testName", new Date(), SECRETKEY)
        const pk = bc.getMyPublicKey()

        await User.create({
            mail: "test@test.test",
            password: "test",
            publickey: pk,
            name: "test",
            secretkey: sk,
            blocks: bc.export()
        })

        const expected = {
            v: 0,
            d: "20121212",
            p: "aaa",
            s: 'bbb',
            r: "root",
            m: [],
            i: [],
            t: 2000,
            h: "toto",
            x: []
        }

        const response = await request(app)
            .put('/api/users/save')
            .set('Accept', 'application/json')
            .send({
                publickey: pk,
                block: expected
            })
            .expect(200)

        const user = await User.findOne({ where: { publickey: pk } });
        assert.deepEqual(user.blocks[0], expected)
        assert.equal(user.blocks.length, 3)
    });

    it('Should return 200 and update given new block if not new.', async () => {
        const bc = new CitizenBlockchain()
        const sk = bc.startBlockchain("testName", new Date(), SECRETKEY)
        const pk = bc.getMyPublicKey()
        bc.pay(sk, pk, 1)

        const bc2 = new CitizenBlockchain()
        const sk2 = bc2.startBlockchain("Payer", new Date(), SECRETKEY)
        const transaction = bc2.pay(sk2, pk, 1)

        await User.create({
            mail: "test@test.test",
            password: "test",
            publickey: pk,
            name: "test",
            secretkey: sk,
            blocks: bc.export()
        })

        bc.addTransaction(transaction)

        assert.equal(bc.blocks.length, 3)

        const response = await request(app)
            .put('/api/users/save')
            .set('Accept', 'application/json')
            .send({
                publickey: pk,
                block: bc.lastblock.export()
            })
            .expect(200)

        const user = await User.findOne({ where: { publickey: pk } });
        assert.equal(user.blocks.length, 3)
        assert.deepEqual(user.blocks, bc.export())
        assert.equal(user.blocks[0].x.length, 2)
    });
});

describe('PUT /users/sign', () => {
    it('Should return json format.', (done) => {
        request(app)
            .put('/api/users/sign')
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/, done)
    });

    it('Should return 404 for unknown user', (done) => {
        request(app)
            .put('/api/users/sign')
            .set('Accept', 'application/json')
            .send({
                publickey: "1206ffd8f4fe843f5f7183179dcf36f550326813f56ec824911abca9c9d1cd7834",
                block: []
            })
            .expect(404, done)
    });

    it('Should return 200, update and sign given new block if not new.', async () => {
        const bc = new CitizenBlockchain()
        const sk = bc.startBlockchain("testName", new Date(), SECRETKEY)
        const pk = bc.getMyPublicKey()
        bc.pay(sk, pk, 1)

        const bc2 = new CitizenBlockchain()
        const sk2 = bc2.startBlockchain("Payer", new Date(), SECRETKEY)
        const transaction = bc2.pay(sk2, pk, 1)

        await User.create({
            mail: "test@test.test",
            password: "test",
            publickey: pk,
            name: "test",
            secretkey: sk,
            blocks: bc.export()
        })

        bc.addTransaction(transaction)

        assert.equal(bc.blocks.length, 3)

        const response = await request(app)
            .put('/api/users/sign')
            .set('Accept', 'application/json')
            .send({
                publickey: pk,
                block: bc.export()[0]
            })
            .expect(200)

        const user = await User.findOne({ where: { publickey: pk } });
        assert.equal(user.blocks.length, 3)
        assert.ok(user.blocks[0].h)
        assert.equal(user.blocks[0].x.length, 2)
        assert.ok(new CitizenBlockchain(user.blocks).lastblock.isValid())
    });
});