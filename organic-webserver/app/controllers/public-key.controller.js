import { publicFromPrivate } from 'organic-money';

/**
 * 
 */
export async function getPublicKey(req, res) {

    const pk = publicFromPrivate()

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