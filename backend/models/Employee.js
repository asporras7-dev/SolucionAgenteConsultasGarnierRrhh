import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const Employee = sequelize.define('Employee', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true,
    allowNull: false
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      isEmail: true
    }
  },
  role: {
    type: DataTypes.ENUM('employee', 'hr_admin'),
    defaultValue: 'employee',
    allowNull: false
  },
  startDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  onboardingFlowId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  onboardingCompleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false
  }
}, {
  tableName: 'employees'
});

export default Employee;
