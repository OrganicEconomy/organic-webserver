/**
 * Sends one request-auth signed request (PROTOCOL.md §5.1) and prints the answer.
 *
 *   SK=<secret key hex> node scripts/signed-request.mjs <METHOD> <path> ['<json body>']
 *
 * BASE_URL defaults to http://127.0.0.1:6868, the port of .env.dev.
 */
import { randomBytes } from 'node:crypto'
import { signHash, publicFromPrivate } from 'organic-money/src/index.js'
import { hashRequestAuth, REQUEST_AUTH_HEADERS } from 'organic-protocol'

const [method, path, body = ''] = process.argv.slice(2)
const secretKey = process.env.SK
const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:6868'

const { serverPk } = await (await fetch(`${baseUrl}/api/v1/info`)).json()
const fields = {
    method,
    path,
    timestamp: Math.floor(Date.now() / 1000),
    nonce: randomBytes(16).toString('hex'),
    body,
    serverPk,
    publickey: publicFromPrivate(secretKey),
}

const res = await fetch(`${baseUrl}${path}`, {
    method,
    body: body || undefined,
    headers: {
        'Content-Type': 'application/json',
        [REQUEST_AUTH_HEADERS.publickey]: fields.publickey,
        [REQUEST_AUTH_HEADERS.timestamp]: String(fields.timestamp),
        [REQUEST_AUTH_HEADERS.nonce]: fields.nonce,
        [REQUEST_AUTH_HEADERS.signature]: signHash(hashRequestAuth(fields), secretKey),
    },
})
console.log(res.status, await res.text())
