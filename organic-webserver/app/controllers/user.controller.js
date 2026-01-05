import { User, WaitingTx } from "../models.js"
import { Op } from 'sequelize'

import { validateBlockchain, updateLastBlock, signLastBlock } from '../services/blockchain.service.js'

export async function loginUser(req, res) {
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
 * 
 */
export async function createUser(req, res) {
    if (!req.body.publickey) {
        res.status(400).send({ message: "publickey cannot be empty!" });
        return;
    }
    if (!req.body.name) {
        res.status(400).send({ message: "name cannot be empty!" });
        return;
    }
    if (!req.body.mail) {
        res.status(400).send({ message: "mail cannot be empty!" });
        return;
    }
    if (!req.body.password) {
        res.status(400).send({ message: "password cannot be empty!" });
        return;
    }
    if (!req.body.secretkey) {
        res.status(400).send({ message: "secretkey cannot be empty!" });
        return;
    }
    if (!req.body.blocks) {
        res.status(400).send({ message: "blocks cannot be empty!" });
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

    user.blocks = validateBlockchain(user.blocks)

    try {
        const data = await User.create(user)
        res.send(data)
    } catch (err) {
        res.status(500).send({
            message:
                err.message || "Some error occurred while creating the User."
        });
    }
}

async function removeWaitingTransactions(lastblock, targetpk) {
    console.log("removeWaitingTransactions")
    const hashList = lastblock.transactions.filter(tx => tx.target === targetpk).map(tx => tx.hash)
    console.log("hashList:")
    console.log(hashList)
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
export async function saveUser(req, res) {
    const publickey = req.body.publickey;
    const lastblock = req.body.block;

    const user = await User.findOne({ where: { publickey: publickey } });

    user.blocks = updateLastBlock(user.blocks, lastblock)

    try {
        await user.save()
        await removeWaitingTransactions(user.blocks[0], publickey)
        res.send({ message: "User was updated successfully." });
    } catch (err) {
        res.status(500).send({ message: `Error updating User with pk=${publickey} : "${err}"` });
    }
}

export async function signAndSaveUser(req, res) {
    const publickey = req.body.publickey;
    const lastblock = req.body.block;

    const user = await User.findOne({ where: { publickey: publickey } });

    user.blocks = updateLastBlock(user.blocks, lastblock)
    user.blocks = signLastBlock(user.blocks)

    try {
        await user.save()
        res.send({ message: "User was updated successfully." });
    } catch (err) {
        res.status(500).send({ message: `Error updating User with pk=${publickey} : "${err}"` });
    }
}