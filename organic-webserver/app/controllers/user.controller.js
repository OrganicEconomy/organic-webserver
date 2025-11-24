import User from "../models/user.model.js";

export function create(req, res) {
    if (!req.body.publickey) {
        res.status(400).send({
            message: "Content can not be empty!"
        });
        return;
    }

    const user = {
        publickey: req.body.publickey,
        name: req.body.name,
        mail: req.body.mail,
        password: req.body.password,
        secretkey: req.body.secretkey,
        blockchain: req.body.blockchain,
    };

    User.create(user)
        .then(data => {
            res.send(data);
        })
        .catch(err => {
            res.status(500).send({
                message:
                    err.message || "Some error occurred while creating the User."
            });
        });
}

/**
 * TODO: Check if transactions are in the "waiting-tx" table and, if yes, remove them.
 */
export function update(req, res) {
    const publickey = req.params.publickey;

    User.update(req.body, {
        where: { publickey: publickey }
    })
        .then(num => {
            if (num == 1) {
                res.send({
                    message: "User was updated successfully."
                });
            } else {
                res.send({
                    message: `Cannot update User with pk=${publickey}. Maybe User was not found or req.body is empty!`
                });
            }
        })
        .catch(err => {
            res.status(500).send({
                message: "Error updating User with pk=" + publickey
            });
        });
}

export function signAndUpdate(req, res) {
    const publickey = req.params.publickey;

    User.update(req.body, {
        where: { publickey: publickey }
    })
        .then(num => {
            if (num == 1) {
                res.send({
                    message: "User was updated successfully."
                });
            } else {
                res.send({
                    message: `Cannot update User with pk=${publickey}. Maybe User was not found or req.body is empty!`
                });
            }
        })
        .catch(err => {
            res.status(500).send({
                message: "Error updating User with pk=" + publickey
            });
        });
}