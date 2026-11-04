import request from 'supertest';
import app from "../app.js";
import assert from "assert";

describe('app', () => {
    it('Should not tell which framework runs the server.', async () => {
        const res = await request(app).get('/api/v1/info').expect(200)

        assert.equal(res.headers['x-powered-by'], undefined)
    });

    it('Should not invite browsers to send cookies along with cross-origin requests.', async () => {
        const res = await request(app)
            .get('/api/v1/info')
            .set('Origin', 'http://localhost:4200')
            .expect(200)

        assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:4200')
        assert.equal(res.headers['access-control-allow-credentials'], undefined)
    });
});
