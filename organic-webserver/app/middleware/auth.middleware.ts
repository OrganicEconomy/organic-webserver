import type { Request, Response, NextFunction } from 'express'
import { BlockMaker, verifySignature, hashTimestampAuth } from 'organic-money/src/index.js'
import { sendError } from '../utils/api-error.js'

const TIMESTAMP_TOLERANCE_SECONDS = 300

export function requireBlockAuth(req: Request, res: Response, next: NextFunction): void {
    const signature = req.headers['x-signature']
    const publickey = req.body?.publickey

    if (!signature || !publickey || !req.body?.block) {
        sendError(res, 401, "Authentication required")
        return
    }

    try {
        const block = BlockMaker.make(req.body.block)
        block.merkle()
        if (!verifySignature(block.hash(), signature, publickey)) {
            sendError(res, 401, "Invalid signature", 'INVALID_SIGNATURE')
            return
        }
    } catch {
        sendError(res, 401, "Invalid signature", 'INVALID_SIGNATURE')
        return
    }

    next()
}

/**
 * publickey/timestamp travel as query params for GET routes (tx/list) and as
 * body fields for POST routes (users/password) — PROTOCOL.md §5.1 allows both.
 */
export function requireTimestampAuth(req: Request, res: Response, next: NextFunction): void {
    const signature = req.headers['x-signature']
    const publickey = req.query.publickey ?? req.body?.publickey
    const timestamp = req.query.timestamp ?? req.body?.timestamp

    if (!signature || !publickey || !timestamp) {
        sendError(res, 401, "Authentication required")
        return
    }

    const ts = parseInt(timestamp as string)
    if (isNaN(ts) || Math.abs(Date.now() / 1000 - ts) > TIMESTAMP_TOLERANCE_SECONDS) {
        sendError(res, 401, "Expired or invalid timestamp")
        return
    }

    if (!verifySignature(hashTimestampAuth(publickey as string, timestamp as string), signature as string, publickey as string)) {
        sendError(res, 401, "Invalid signature", 'INVALID_SIGNATURE')
        return
    }

    next()
}
