import request from 'supertest';
import app from "../app.js";
import assert from "assert";
import { UsedPaper } from "../app/models.js";

const validHash = "30450221008fd37a1a0b6fb7c974108a591ac5b1eb8fed8161dfd5f0a9d0c8b4aa0722da6d02200b0effdd13b841930500e3ef50e4bc941b304a845fac382e9360cfe4cbec5c8"
const hashLength = validHash.length

describe('GET /isCashed', () => {
  it('Should return json format.', (done) => {
    request(app)
      .get('/api/papers/isCashed')
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/, done)
  });

  it('Should return 400 for no paper.', (done) => {
    request(app)
      .get('/api/papers/isCashed')
      .set('Accept', 'application/json')
      .expect(400)
      .expect({ message: "Content can not be empty!" }, done)
  });

  it('Should return 404 for unknown paper.', (done) => {
    request(app)
      .get('/api/papers/isCashed?hash=' + validHash.replace("a", "b"))
      .set('Accept', 'application/json')
      .expect(404, done)
  });

  it('Should return 400 if given hash is < 141 chars.', (done) => {
    request(app)
      .get('/api/papers/isCashed?hash=' + validHash.slice(0, -1))
      .set('Accept', 'application/json')
      .expect(400)
      .end((err, response) => {
        if (err) return done(err);
        assert.equal(response.text, '{"message":"Invalid hash format."}')
        return done();
      });
  });

  it('Should return 400 if given hash is > 141 chars.', (done) => {
    request(app)
      .get('/api/papers/isCashed?hash=' + validHash + "1")
      .set('Accept', 'application/json')
      .expect(400)
      .end((err, response) => {
        if (err) return done(err);
        assert.equal(response.text, '{"message":"Invalid hash format."}')
        return done();
      });
  });

  it('Should return 200 with Id for ok paper.', (done) => {
    UsedPaper.create({ hash: validHash })
      .then(() => {
        request(app)
          .get('/api/papers/isCashed?hash=' + validHash)
          .set('Accept', 'application/json')
          .expect(200)
          .expect(validHash, done)
      })
  });
});

describe('POST /cashPaper', () => {
  it('Should return json format.', (done) => {
    request(app)
      .post('/api/papers/cash')
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/, done)
  });

  it('Should return 400 for incorrect format.', (done) => {
    request(app)
      .post('/api/papers/cash')
      .set('Accept', 'application/json')
      .expect(400, done)
  });

  it('Should return 400 if given hash is < 141 chars.', (done) => {
    request(app)
      .post('/api/papers/cash')
      .set('Accept', 'application/json')
      .send({ hash: validHash.slice(0, -1) })
      .expect(400)
      .end((err, response) => {
        if (err) return done(err);
        assert.equal(response.text, '{"message":"Invalid hash format."}')
        return done();
      });
  });

  it('Should return 400 if given hash is > 141 chars.', (done) => {
    const toolonghash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1"
    request(app)
      .post('/api/papers/cash')
      .set('Accept', 'application/json')
      .send({ hash: toolonghash })
      .expect(400)
      .end((err, response) => {
        if (err) return done(err);
        assert.equal(response.text, '{"message":"Invalid hash format."}')
        return done();
      });
  });

  it('Should return 200 and success message if given hash is ok.', (done) => {
    const hash = "aaaaaa21008fd37a1a0b6fb7c974108a591ac5b1eb8fed8161dfd5f0a9d0c8b4aa0722da6d02200b0effdd13b841930500e3ef50e4bc941b304a845fac382e9360cfe4cbec5c8"
    request(app)
      .post('/api/papers/cash')
      .set('Accept', 'application/json')
      .send({ hash: hash })
      .expect(200)
      .end((err, response) => {
        //console.log(response)
        if (err) return done(err);
        assert.equal(response.text, '{"message":"Papers successfully cashed."}')
        return done();
      });
  });
});