import request from 'supertest';
import app from "../app.js";
import assert from "assert";
import { User } from "../app/models.js";
import { Blockchain, CitizenBlockchain } from 'organic-money/src/index.js';

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
        const name = "testName"
        bc.makeBirthBlock(sk, birthdate, name)
        const blocks = bc.blocks

        const expected = {
            "publickey": "0306ffd8f4fe843f5f7183179dcf36f550326813f56ec824911abca9c9d1cd7834",
            "blocks": [
                {
                    "closedate": 20260118,
                    "previousHash": "3045022100c98475c1283df35da04bb596c74b9a4a293c009337a603922c78c5d5c5a1887302201faefd9ed1f623833ce5473b5619fd7ffb47e1d67873491651d17d5562c00c09",
                    "signer": "02c85e4e448d67a8dc724c620f3fe7d2a3a3cce9fe905b918f712396b4f8effcb3",
                    "merkleroot": 0,
                    "money": [20260118000],
                    "invests": [20260118000],
                    "total": 0, "transactions": [],
                    "version": 1,
                    "hash": "304402206f7c0968fa1f3b4f71dfc5f5f2ecd8b44838e49714bd345bc20184d79c737b230220430ce78f0688abc5f528cde6865c1befd9bf20caa0abbde5b5009e038ef1d513"
                },
                {
                    "version": 1,
                    "closedate": 20260118,
                    "previousHash": "c1a551ca1c0deea5efea51b1e1dea112ed1dea0a5150f5e11ab1e50c1a15eed5",
                    "signer": "0306ffd8f4fe843f5f7183179dcf36f550326813f56ec824911abca9c9d1cd7834",
                    "merkleroot": 0,
                    "money": [20260118000],
                    "invests": [20260118000],
                    "total": 0,
                    "transactions": [
                        {
                            "version": 1,
                            "date": 20130128,
                            "source": "0306ffd8f4fe843f5f7183179dcf36f550326813f56ec824911abca9c9d1cd7834",
                            "target": "testName",
                            "signer": 0,
                            "money": [],
                            "invests": [],
                            "type": 0,
                            "hash": "304402204f26293bc8cb9d49406f44067e87eb108535d5505b9533338f66f8621f0c172802200aa8895884eb269dbac71bd3157248ae978a5f82a829362a8a953744c7d463d2"
                        },
                        {
                            "version": 1,
                            "date": 20260118,
                            "source": "0306ffd8f4fe843f5f7183179dcf36f550326813f56ec824911abca9c9d1cd7834",
                            "target": "0306ffd8f4fe843f5f7183179dcf36f550326813f56ec824911abca9c9d1cd7834",
                            "signer": 0,
                            "money": [20260118000],
                            "invests": [20260118000],
                            "type": 1,
                            "hash": "3045022100b677751fe8cc8948617c67a2c7eaf2fda39093d13880a464b60c886303ff956102204abf4dfb1fcc788cc1d940c6efcb3f2ed9cc7d99e240d32400404740d4f0d5a5"
                        }
                    ],
                    "hash": "3045022100c98475c1283df35da04bb596c74b9a4a293c009337a603922c78c5d5c5a1887302201faefd9ed1f623833ce5473b5619fd7ffb47e1d67873491651d17d5562c00c09"
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
                assert.deepEqual(JSON.parse(response.text), expected)
                return done();
            });
    });
});

describe.only('PUT /users/save', () => {
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
});