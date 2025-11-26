import { UsedPaper } from "../models.js";

export async function create(req, res) {
    if (!req.body.papers) {
        res.status(400).send({ message: "Content can not be empty!" });
        return;
    }

    // papers = [{id: "id1"}, {id: "id2"}, etc...]
    try {
        await UsedPaper.bulkCreate(papers)
        res.send({ message: "Papers successfully saved." });
    } catch (err) {
        res.status(500).send({
            message:
                err.message || "Some error occurred while creating the paper."
        });
    }
}