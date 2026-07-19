import request from 'supertest'
import assert from 'node:assert'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { PROTOCOL_VERSION, type InfoResponse, type ServerListEntry } from 'organic-protocol'
import { publicFromPrivate } from 'organic-money/src/index.js'
import app from '../app.js'

describe('GET /api/v1/info', () => {
    it('Should return the public identity card of the server.', async () => {
        const res = await request(app)
            .get('/api/v1/info')
            .expect(200)
            .expect('Content-Type', /json/)
        const info: InfoResponse = res.body
        assert.strictEqual(info.protocolVersion, PROTOCOL_VERSION)
        assert.strictEqual(info.apiVersion, '1')
        assert.strictEqual(info.serverPk, publicFromPrivate(process.env.ORGANIC_SECRET_KEY!))
        assert.strictEqual(info.corePk, null)
        assert.strictEqual(typeof info.name, 'string')
        assert.ok(info.name.length > 0)
        assert.strictEqual(typeof info.stats.users, 'number')
    });

    it('Should count registered users in stats.', async () => {
        const before = (await request(app).get('/api/v1/info')).body.stats.users
        assert.strictEqual(typeof before, 'number')
    });
});

describe('GET /api/v1/servers', () => {
    const fixtureUrl = new URL('./fixtures/known-servers.fixture.json', import.meta.url)

    afterEach(() => {
        delete process.env.KNOWN_SERVERS_FILE
    });

    it('Should serve the content of the known-servers file.', async () => {
        process.env.KNOWN_SERVERS_FILE = fileURLToPath(fixtureUrl)
        const fixture: ServerListEntry[] = JSON.parse(await readFile(fixtureUrl, 'utf8'))
        const res = await request(app)
            .get('/api/v1/servers')
            .expect(200)
            .expect('Content-Type', /json/)
        assert.deepStrictEqual(res.body, fixture)
        assert.ok(fixture.length > 0)
    });

    it('Should serve app/config/known-servers.json by default.', async () => {
        const file: ServerListEntry[] = JSON.parse(
            await readFile(new URL('../app/config/known-servers.json', import.meta.url), 'utf8')
        )
        const res = await request(app)
            .get('/api/v1/servers')
            .expect(200)
            .expect('Content-Type', /json/)
        assert.deepStrictEqual(res.body, file)
    });
});

describe('Legacy /api aliases', () => {
    it('Should serve /info on the legacy /api prefix too.', async () => {
        const res = await request(app).get('/api/info').expect(200)
        assert.strictEqual(res.body.protocolVersion, PROTOCOL_VERSION)
    });

    it('Should serve existing routes under /api/v1 as well.', (done) => {
        request(app)
            .post('/api/v1/users/login')
            .set('Accept', 'application/json')
            .expect('Content-Type', /json/, done)
    });

    it('Should return 404 for the removed public-key route.', (done) => {
        request(app)
            .get('/api/public-key')
            .expect(404, done)
    });
});
