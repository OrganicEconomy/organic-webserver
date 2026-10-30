import type { Request, Response } from 'express'
import { UsedPaper } from "../models.js";

// A DER-encoded SECP256K1 signature (hex) doesn't have a fixed length — it
// varies with r/s padding (observed 136-142 chars over 20000 samples; hex is
// always even-length, hence pairs below). 130-146 is a generous margin around
// that, wide enough to never reject a real signature but still catching
// garbage/wrong-format input.
const SIGNATURE_HASH_PATTERN = /^([0-9a-f]{2}){65,73}$/i

export async function getIsCashed(req: Request, res: Response): Promise<void> {
    if (!req.query || !req.query.hash) {
        res.status(400).send({ message: "Content can not be empty!" });
        return;
    }

    const hash = req.query.hash as string

    if (!SIGNATURE_HASH_PATTERN.test(hash)) {
        res.status(400).send({ message: "Invalid hash format." });
        return;
    }

    const alreadyUsedPaper = await UsedPaper.findOne({
        where: {
            hash: hash,
        }
    });

    if (alreadyUsedPaper === null) {
        res.status(404).send()
    } else {
        res.send(hash);
    }
}
