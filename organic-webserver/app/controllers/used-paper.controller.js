import { UsedPaper } from "../models.js";

/**
 * hash (141 characters)
 */
export async function postCashPaper(req, res) {
    if (!req.body || !req.body.hash) {
        res.status(400).send({ message: "Field 'hash' Needed" });
        return;
    }
    const hash = req.body.hash

    if (hash.length < 141 || hash.length > 141) {
        res.status(400).send({ message: "Invalid hash format." });
    }

    try {
        await UsedPaper.create({ hash: hash })
        res.send({ message: "Papers successfully cashed." });
    } catch (err) {
        res.status(500).send({
            message:
                err.message || "Some error occurred while creating the paper."
        });
    }
}

/**
 * hash (141 characters)
 */
export async function getIsCashed(req, res) {
    if (!req.query || !req.query.hash) {
        res.status(400).send({ message: "Content can not be empty!" });
        return;
    }

    const hash = req.query.hash

    if (hash.length < 141 || hash.length > 141) {
        res.status(400).send({ message: "Invalid hash format." });
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