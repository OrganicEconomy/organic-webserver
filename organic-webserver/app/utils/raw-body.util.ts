import type { IncomingMessage } from 'node:http'
import type { Request } from 'express'

const rawBodies = new WeakMap<IncomingMessage, string>()

export function keepRawBody(req: IncomingMessage, _res: unknown, buffer: Buffer): void {
    rawBodies.set(req, buffer.toString('utf8'))
}

export function rawBodyOf(req: Request): string {
    return rawBodies.get(req) ?? ''
}
