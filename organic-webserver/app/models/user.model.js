export default (sequelize, Sequelize) => {
    const User = sequelize.define("user", {
        publickey: {
            type: Sequelize.STRING(70),
            allowNull: false
        },
        name: {
            type: Sequelize.STRING,
            allowNull: false
        },
        mail: {
            type: Sequelize.STRING,
            allowNull: false
        },
        password: {
            type: Sequelize.STRING,
            allowNull: false
        },
        secretkey: {
            type: Sequelize.STRING,
            allowNull: false
        },
        blockchain: {
            type: Sequelize.JSON,
            allowNull: false
        }
    });

    return User;
};