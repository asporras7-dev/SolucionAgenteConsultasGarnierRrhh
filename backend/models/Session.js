import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const Session = sequelize.define('Session', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true,
    allowNull: false
  },
  employeeId: {
    type: DataTypes.STRING,
    allowNull: false,
    references: {
      model: 'employees',
      key: 'id'
    }
  },
  active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false
  }
}, {
  tableName: 'sessions'
});

export default Session;
