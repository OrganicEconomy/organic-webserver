import WaitingTx from "../models/waiting-tx.model.js";

export async function create(req, res) {
    if (!req.body.tx) {
        res.status(400).send({
            message: "Content can not be empty!"
        });
        return;
    }

    // papers = [{id: "id1"}, {id: "id2"}, etc...]
    await WaitingTx.create(req.body)
        .then(data => {
            res.send(data);
        })
        .catch(err => {
            res.status(500).send({
                message:
                    err.message || "Some error occurred while creating the paper."
            });
        });
}