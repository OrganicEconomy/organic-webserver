import { User, WaitingTx } from "../models.js"
import { Op } from 'sequelize'

import { validateBlockchain, updateLastBlock, signLastBlock } from '../services/blockchain.service.js'

export async function getLoginUser(req, res) {
    if (!req.query || !req.query.mail || !req.query.password) {
        res.status(400).send({ message: "Fields 'mail' and 'password' are needed" });
        return;
    }

    const mail = req.query.mail;
    const password = req.query.password;

    const user = await User.findOne({ where: { mail: mail, password: password } });

    if (user === null) {
        res.status(404).send({ message: "User not found or invalid password" });
        return
    }
    res.send(user)
}

/**
 * TODO: hash the password before save
 */
export async function postRegister(req, res) {
    if (!req.body || !req.body.publickey || !req.body.name || !req.body.mail
        || !req.body.password || !req.body.secretkey || !req.body.blocks) {
        res.status(400).send({ message: "Fields 'publickey', 'name', 'mail', 'password', 'secretkey' and 'blocks' are needed." });
        return;
    }

    const user = {
        publickey: req.body.publickey,
        name: req.body.name,
        mail: req.body.mail,
        password: req.body.password,
        secretkey: req.body.secretkey,
        blocks: req.body.blocks
    };

    try {
        user.blocks = validateBlockchain(user.blocks)
    } catch (err) {
        res.status(400).send({ message: "Invalid blockchain" });
        return
    }


    try {
        const data = await User.create(user)
        const filtredData = (({ publickey, blocks }) => ({ publickey, blocks }))(data);
        res.send(filtredData)
    } catch (err) {
        res.status(500).send({
            message:
                err.message || "Some error occurred while creating the User."
        });
    }
}

async function removeWaitingTransactions(lastblock, targetpk) {
    if (!lastblock.transactions) { return }
    const hashList = lastblock.transactions.filter(tx => tx.target === targetpk).map(tx => tx.hash)

    if (hashList.length === 0) {
        return
    }
    await WaitingTx.destroy({
        where: {
            hash: {
                [Op.in]: hashList,
            }
        }
    })
}

/**
 * Save the given block for user of given publickey
 * Then remove from database every WaitingTx found in that block
 * (because they are no more waiting)
 */
export async function putSaveUser(req, res) {
    if (!req.body || !req.body.publickey || !req.body.block) {
        res.status(400).send({ message: "Fields 'publickey' and 'block' are needed." });
        return;
    }

    const publickey = req.body.publickey;
    const lastblock = req.body.block;

    const user = await User.findOne({ where: { publickey: publickey } });

    if (!user) {
        res.status(404).send()
    }

    const newBlocks = updateLastBlock(user.blocks, lastblock)

    try {
        await User.update(
            { blocks: newBlocks },
            { where: { publickey: publickey } }
        )
        await removeWaitingTransactions(user.blocks[0], publickey)
        res.send({ message: "User was updated successfully." });
    } catch (err) {
        res.status(500).send({ message: `Error updating User with pk=${publickey} : "${err}"` });
    }
}

export async function putSignAndSaveUser(req, res) {
    if (!req.body || !req.body.publickey || !req.body.block) {
        res.status(400).send({ message: "Fields 'publickey' and 'block' are needed." });
        return;
    }

    const publickey = req.body.publickey;
    const lastblock = req.body.block;

    const user = await User.findOne({ where: { publickey: publickey } });

    if (!user) {
        res.status(404).send()
    }

    let newBlocks = updateLastBlock(user.blocks, lastblock)
    newBlocks = signLastBlock(newBlocks)

    try {
        await User.update(
            { blocks: newBlocks },
            { where: { publickey: publickey } }
        )
        res.send({ message: "User was updated successfully." });
    } catch (err) {
        res.status(500).send({ message: `Error updating User with pk=${publickey} : "${err}"` });
    }
}