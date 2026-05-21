import sequelize from '../config/database.js';

(async () => {
  try {
    const queryInterface = sequelize.getQueryInterface();
    await queryInterface.changeColumn('documents', 'adminId', {
      type: sequelize.Sequelize.STRING,
      allowNull: true,
      defaultValue: ''
    });
    console.log('adminId column altered successfully');
  } catch (err) {
    console.error('Error altering adminId column:', err);
  } finally {
    await sequelize.close();
  }
})();
