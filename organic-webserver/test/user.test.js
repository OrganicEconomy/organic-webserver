import request from 'supertest';
import app from "../app.js";
import assert from "assert";
import { User } from "../app/models.js";
import { Blockchain, CitizenBlockchain } from 'organic-money/src/index.js';

const SECRETKEY = process.env.ORGANIC_SECRET_KEY

describe('GET /users/login', () => {
    it('Should return json format.', (done) => {
        request(app)
            .get('/api/users/login')
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/, done)
    });

    it('Should return 404 for unknown user', (done) => {
        request(app)
            .get('/api/users/login?mail=toto@toto.toto&password=didadou')
            .set('Accept', 'application/json')
            .expect(404, done)
    });

    it('Should return 200 and user for known user', (done) => {
        const mail = "test3@test3.com"
        const password = "test3"
        User.create({
            mail: mail,
            password: password,
            publickey: "",
            name: "test3",
            secretkey: "",
            blocks: []
        })
            .then(() => {
                request(app)
                    .get('/api/users/login?mail=' + mail + '&password=' + password)
                    .set('Accept', 'application/json')
                    .expect(200, done)
            });
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
        const today = Blockchain.dateToInt(new Date())
        const name = "testName"
        bc.makeBirthBlock(sk, birthdate, name)
        const blocks = bc.blocks

        const expected = {
            "publickey": "0306ffd8f4fe843f5f7183179dcf36f550326813f56ec824911abca9c9d1cd7834",
            "blocks": [
                {
                    "closedate": today,
                    "signer": "02c85e4e448d67a8dc724c620f3fe7d2a3a3cce9fe905b918f712396b4f8effcb3",
                    "merkleroot": 0,
                    "money": [today*1000],
                    "invests": [today* 1000],
                    "total": 0, "transactions": [],
                    "version": 1,
                },
                {
                    "version": 1,
                    "closedate": today,
                    "previousHash": "c1a551ca1c0deea5efea51b1e1dea112ed1dea0a5150f5e11ab1e50c1a15eed5",
                    "signer": "0306ffd8f4fe843f5f7183179dcf36f550326813f56ec824911abca9c9d1cd7834",
                    "merkleroot": 0,
                    "money": [today*1000],
                    "invests": [today*1000],
                    "total": 0,
                    "transactions": [
                        {
                            "version": 1,
                            "date": Blockchain.dateToInt(birthdate),
                            "source": "0306ffd8f4fe843f5f7183179dcf36f550326813f56ec824911abca9c9d1cd7834",
                            "target": "testName",
                            "signer": 0,
                            "money": [],
                            "invests": [],
                            "type": 0,
                        },
                        {
                            "version": 1,
                            "date": today,
                            "source": "0306ffd8f4fe843f5f7183179dcf36f550326813f56ec824911abca9c9d1cd7834",
                            "target": "0306ffd8f4fe843f5f7183179dcf36f550326813f56ec824911abca9c9d1cd7834",
                            "signer": 0,
                            "money": [today*1000],
                            "invests": [today*1000],
                            "type": 1,
                        }
                    ],
                }
            ]
        }

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
                assert.partialDeepStrictEqual(JSON.parse(response.text), expected)
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
        const pk = Blockchain.publicFromPrivate(sk)

        await User.create({
            mail: "test@test.test",
            password: "test",
            publickey: pk,
            name: "test",
            secretkey: sk,
            blocks: bc.blocks
        })

        const expected = {
            toto: "toto",
            tata: "tata"
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
        const pk = Blockchain.publicFromPrivate(sk)
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
            blocks: bc.blocks
        })

        bc.income(transaction)

        assert.equal(bc.blocks.length, 3)

        const response = await request(app)
            .put('/api/users/save')
            .set('Accept', 'application/json')
            .send({
                publickey: pk,
                block: bc.blocks[0]
            })
            .expect(200)

        const user = await User.findOne({ where: { publickey: pk } });
        assert.equal(user.blocks.length, 3)
        assert.deepEqual(user.blocks, bc.blocks)
        assert.equal(user.blocks[0].transactions.length, 2)
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
        const pk = Blockchain.publicFromPrivate(sk)
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
            blocks: bc.blocks
        })

        bc.income(transaction)

        assert.equal(bc.blocks.length, 3)

        const response = await request(app)
            .put('/api/users/sign')
            .set('Accept', 'application/json')
            .send({
                publickey: pk,
                block: bc.blocks[0]
            })
            .expect(200)

        const user = await User.findOne({ where: { publickey: pk } });
        assert.equal(user.blocks.length, 3)
        assert.ok(user.blocks[0].hash)
        assert.equal(user.blocks[0].transactions.length, 2)
        console.log(user.blocks[0])
        assert.ok(Blockchain.isValidBlock(user.blocks[0]))
    });
});