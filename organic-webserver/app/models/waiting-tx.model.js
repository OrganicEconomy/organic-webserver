export default (sequelize, Sequelize) => {
    const WaitingTx = sequelize.define("waitingtx", {
        tx: {
            type: Sequelize.JSON,
            allowNull: false
        }
    });

    return WaitingTx;
};