import { User, WaitingTx } from "../models.js"
import { Op } from 'sequelize'
import bcrypt from 'bcryptjs'

import { validateBlockchain, updateLastBlock, signLastBlock } from '../services/blockchain.service.js'

export async function postLoginUser(req, res) {
    if (!req.body || !req.body.mail || !req.body.password) {
        res.status(400).send({ message: "Fields 'mail' and 'password' are needed" });
        return;
    }

    const mail = req.body.mail;
    const password = req.body.password;

    const user = await User.findOne({ where: { mail: mail } });
    const isPasswordValid = user !== null && await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
        res.status(404).send({ message: "User not found or invalid password" });
        return
    }
    res.send(user)
}

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
        password: await bcrypt.hash(req.body.password, 10),
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
        const filteredData = (({ publickey, blocks }) => ({ publickey, blocks }))(data);
        res.send(filteredData)
    } catch (err) {
        res.status(500).send({
            message:
                err.message || "Some error occurred while creating the User."
        });
    }
}

async function removeWaitingTransactions(lastblock, targetpk) {
    if (!lastblock.x) { return }
    const hashList = lastblock.x.filter(tx => tx.t === targetpk).map(tx => tx.h)

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
    let blocks;

    const user = await User.findOne({ where: { publickey: publickey } });

    if (!user) {
        res.status(404).send()
        return
    }

    try {
        blocks = updateLastBlock(user.blocks, lastblock)
    } catch (err) {
        res.status(500).send({ message: `Error updating User with pk=${publickey} : "${err}"` });
        return
    }

    try {
        await User.update(
            { blocks: blocks },
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
        return
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