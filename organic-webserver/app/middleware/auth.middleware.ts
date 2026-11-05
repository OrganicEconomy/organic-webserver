import type { Request, Response, NextFunction } from 'express'
import { verifySignature, publicFromPrivate } from 'organic-money/src/index.js'
import { hashRequestAuth, REQUEST_AUTH_HEADERS, REQUEST_AUTH_TOLERANCE_SECONDS } from 'organic-protocol'
import { sendError } from '../utils/api-error.js'
import { rawBodyOf } from '../utils/raw-body.util.js'
import { isFirstUse } from '../utils/replay-guard.util.js'

const SERVER_PK = publicFromPrivate(process.env.ORGANIC_SECRET_KEY as string)

export function requireRequestAuth(req: Request, res: Response, next: NextFunction): void {
    const publickey = req.get(REQUEST_AUTH_HEADERS.publickey)
    const timestamp = Number(req.get(REQUEST_AUTH_HEADERS.timestamp))
    const nonce = req.get(REQUEST_AUTH_HEADERS.nonce)
    const signature = req.get(REQUEST_AUTH_HEADERS.signature)

    if (!publickey || !nonce || !signature || !Number.isInteger(timestamp)) {
        sendError(res, 401, "Authentication required")
        return
    }

    if (!isWithinTolerance(timestamp)) {
        sendError(res, 401, "Expired or invalid timestamp")
        return
    }

    const requestHash = hashRequestAuth({
        method: req.method, path: req.originalUrl, timestamp, nonce,
        body: rawBodyOf(req), serverPk: SERVER_PK, publickey,
    })

    if (!isValidSignature(requestHash, signature, publickey)) {
        sendError(res, 401, "Invalid signature", 'INVALID_SIGNATURE')
        return
    }

    if (!isFirstUse(Buffer.from(requestHash).toString('hex'))) {
        sendError(res, 401, "This signed request was already used", 'REPLAYED_REQUEST')
        return
    }

    res.locals.authenticatedPk = publickey
    next()
}

function isWithinTolerance(timestamp: number): boolean {
    return Math.abs(Date.now() / 1000 - timestamp) <= REQUEST_AUTH_TOLERANCE_SECONDS
}

function isValidSignature(requestHash: Uint8Array, signature: string, publickey: string): boolean {
    try {
        return verifySignature(requestHash, signature, publickey)
    } catch {
        return false
    }
}
