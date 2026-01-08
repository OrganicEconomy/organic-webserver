import { UsedPaper } from "../models.js";

export async function cashPaper(req, res) {
    if (!req.body.paperHash) {
        res.status(400).send({ message: "Field 'paperHash' Needed" });
        return;
    }

    try {
        console.log(req.body.paperHash)
        await UsedPaper.create({ hash: req.body.paperHash })
        res.send({ message: "Papers successfully cashed." });
    } catch (err) {
        res.status(500).send({
            message:
                err.message || "Some error occurred while creating the paper."
        });
    }
}

export async function isItUsed(req, res) {
    if (!req.query.paper) {
        res.status(400).send({ message: "Content can not be empty!" });
        return;
    }
    console.log("paper hash:")
    console.log(req.query.paper)

    const alreadyUsedPaper = await UsedPaper.findOne({ 
        where: {
            hash: req.query.paper,
        }
    });

    if (alreadyUsedPaper === null) {
        res.send(false);
    } else {
        res.send(true);
    }
}