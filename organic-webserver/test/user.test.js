import request from 'supertest';
import app from "../app.js";
import assert from "assert";
import { User } from "../app/models.js";

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

    it.only('Should return 200 for valid blockchain.', (done) => {
        const bc = new CitizenBlockchain()
        const sk = Blockchain.randomPrivateKey()
        bc.makeBirthBlock(sk, birthdate, name, new Date())
        const pk = bc.getMyPublicKey()
        const blocks = bc.blocks
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
            .end((err, response) => {
                console.log(response)
                if (err) return done(err);
                //assert.equal(response.text, '{"message":"Invalid hash format."}')
                return done();
            });
        //.expect(400, done)
    });
});