import { BlockMaker, verifySignature, hashTimestampAuth } from 'organic-money/src/index.js'

const TIMESTAMP_TOLERANCE_SECONDS = 300

export function requireBlockAuth(req, res, next) {
    const signature = req.headers['x-signature']
    const publickey = req.body?.publickey

    if (!signature || !publickey || !req.body?.block) {
        res.status(401).send({ message: "Authentication required" })
        return
    }

    try {
        const block = BlockMaker.make(req.body.block)
        block.merkle()
        if (!verifySignature(block.hash(), signature, publickey)) {
            res.status(401).send({ message: "Invalid signature" })
            return
        }
    } catch {
        res.status(401).send({ message: "Invalid signature" })
        return
    }

    next()
}

export function requireTimestampAuth(req, res, next) {
    const signature = req.headers['x-signature']
    const { publickey, timestamp } = req.query

    if (!signature || !publickey || !timestamp) {
        res.status(401).send({ message: "Authentication required" })
        return
    }

    const ts = parseInt(timestamp)
    if (isNaN(ts) || Math.abs(Date.now() / 1000 - ts) > TIMESTAMP_TOLERANCE_SECONDS) {
        res.status(401).send({ message: "Expired or invalid timestamp" })
        return
    }

    if (!verifySignature(hashTimestampAuth(publickey, timestamp), signature, publickey)) {
        res.status(401).send({ message: "Invalid signature" })
        return
    }

    next()
}
