export default (sequelize, Sequelize) => {
    const UsedPaper = sequelize.define("usedpaper", {
        id: {
            type: Sequelize.STRING(70),
            primaryKey: true
        }
    });

    return UsedPaper;
};