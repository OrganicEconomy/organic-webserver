import request from 'supertest';
import app from "../app.js";
import assert from "assert";
import express from 'express';
import { errorHandler } from "../app/utils/error-handler.js";

describe('errorHandler', () => {
    it('Should answer a malformed json body with a json error and no stack trace.', async () => {
        const res = await request(app)
            .post('/api/v1/users/login')
            .set('Content-Type', 'application/json')
            .send('{ "mail": ')
            .expect(400)
            .expect('Content-Type', /json/)

        assert.ok(res.body.error)
        assert.doesNotMatch(res.text, /at .*\.js/)
    });

    it('Should answer an unexpected error with a generic message that leaks none of its details.', async () => {
        const failingApp = express()
        failingApp.get('/fail', () => { throw new Error('secret detail') })
        failingApp.use(errorHandler)

        const res = await request(failingApp).get('/fail').expect(500)

        assert.doesNotMatch(res.text, /secret detail/)
    });
});
