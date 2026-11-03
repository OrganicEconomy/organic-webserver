import request from 'supertest'
import assert from 'node:assert'
import app from '../app.js'

function failLoginFrom(clientIp: string) {
    return request(app)
        .post('/api/v1/users/login')
        .set('X-Forwarded-For', clientIp)
        .send({ mail: 'nobody@example.org', password: 'wrong' })
}

describe('POST /api/v1/users/login', () => {
    it('should count failed logins per client behind the reverse proxy', async () => {
        process.env.NODE_ENV = 'production'
        try {
            for (let attempt = 0; attempt < 10; attempt++) {
                await failLoginFrom('203.0.113.1')
            }
            assert.strictEqual((await failLoginFrom('203.0.113.1')).status, 429)

            assert.notStrictEqual((await failLoginFrom('203.0.113.2')).status, 429)
        } finally {
            process.env.NODE_ENV = 'test'
        }
    })
})
