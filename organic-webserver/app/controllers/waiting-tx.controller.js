import { WaitingTx } from "../models.js";
import { isValidTransaction } from "../services/blockchain.service.js"

export async function createWaitingTx(req, res) {
    if (!req.body.tx) {
        res.status(400).send({ message: "Content cannot be empty!" });
        return;
    }
    if (!isValidTransaction(req.body.tx)) {
        res.status(400).send({ message: "Invalid transaction !" });
        return;
    }

    const waitingtx = {
        hash: req.body.tx.hash,
        target: req.body.tx.target,
        tx: req.body.tx
    };

    try {
        await WaitingTx.create(waitingtx)
        res.send({ message: "Transaction successfully saved." });
    } catch (err) {
        res.status(500).send({
            message: err.message || "Some error occurred while creating the transaction."
        });
    }
}

export async function listWaitingTx(req, res) {
    const publickey = req.query.publickey;

    const transactions = await WaitingTx.findAll({ where: { target: publickey } });

    res.send(transactions)
}