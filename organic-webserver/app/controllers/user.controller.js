import { User, WaitingTx } from "../models.js";

import { validateBlockchain, updateLastBlock, signLastBlock } from '../services/blockchain.service.js'

/**
 * TODO: hash the password before save
 * 
 */
export async function createUser(req, res) {
    if (!req.body.publickey) {
        res.status(400).send({
            message: "Content cannot be empty!"
        });
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
    await WaitingTx.destroy({
        where: {
            [Op.in]: lastblock.transactions.filter(tx => tx.target === targetpk).map(tx => tx.hash),
        }
    })
}

/**
 * Save the given block for user of given publickey
 * Then remove from database every WaitingTx found in that block
 * (because they are no more waiting)
 * @param {*} req 
 * @param {*} res 
 */
export async function saveUser(req, res) {
    const publickey = req.params.publickey;
    const lastblock = req.params.block;

    const user = await User.findAll({
        where: {
            publickey: publickey
        }
    })[0]

    user.blocks = updateLastBlock(user.blocks, lastblock)

    try {
        const num = await user.save()
        if (num == 1) {
            await removeWaitingTransactions(user.blocks[0], publickey)
            res.send({ message: "User was updated successfully." });
        } else {
            res.send({ message: `Cannot update User with pk=${publickey}. Maybe User was not found or req.body is empty!` });
        }
    } catch (err) {
        res.status(500).send({ message: "Error updating User with pk=" + publickey });
    }
}

export async function signAndSaveUser(req, res) {
    const publickey = req.params.publickey;
    const lastblock = req.params.block;

    const user = await User.findAll({
        where: {
            publickey: publickey
        }
    })[0]

    user.blocks = updateLastBlock(user.blocks, lastblock)
        .signLastBlock(user.blocks)

    try {
        const num = await user.save()
        if (num == 1) {
            res.send({ message: "User was updated successfully." });
        } else {
            res.send({ message: `Cannot update User with pk=${publickey}. Maybe User was not found or req.body is empty!` });
        }
    } catch (err) {
        res.status(500).send({ message: "Error updating User with pk=" + publickey });
    }
}