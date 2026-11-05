import request from 'supertest';
import { randomBytes } from 'node:crypto';
import { hashRequestAuth, REQUEST_AUTH_HEADERS, type RequestAuthFields } from 'organic-protocol';
import { publicFromPrivate, signHash } from 'organic-money/src/index.js';
import app from "../../app.js";

type Method = 'get' | 'post' | 'put'

export const SERVER_PK = publicFromPrivate(process.env.ORGANIC_SECRET_KEY as string)

export function signedRequest(method: Method, path: string, sk: string, body?: object, overrides: Partial<RequestAuthFields> = {}) {
    const json = body === undefined ? '' : JSON.stringify(body)
    const fields: RequestAuthFields = {
        method,
        path,
        timestamp: Math.floor(Date.now() / 1000),
        nonce: randomBytes(16).toString('hex'),
        body: json,
        serverPk: SERVER_PK,
        publickey: publicFromPrivate(sk),
        ...overrides,
    }
    const test = request(app)[method](path)
        .set(REQUEST_AUTH_HEADERS.publickey, fields.publickey)
        .set(REQUEST_AUTH_HEADERS.timestamp, String(fields.timestamp))
        .set(REQUEST_AUTH_HEADERS.nonce, fields.nonce)
        .set(REQUEST_AUTH_HEADERS.signature, signHash(hashRequestAuth(fields), sk))
    return body === undefined ? test : test.set('Content-Type', 'application/json').send(json)
}
