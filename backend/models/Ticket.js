import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const Ticket = sequelize.define('Ticket', {
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
  employeeName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  query: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  reason: {
    type: DataTypes.STRING, // 'no_information', 'sensitive_topic', 'urgent', etc.
    allowNull: false
  },
  priority: {
    type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
    defaultValue: 'low',
    allowNull: false
  },
  sessionId: {
    type: DataTypes.STRING,
    allowNull: false
  },
  empatheticMessage: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  hrNotified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false
  },
  estimatedResponse: {
    type: DataTypes.STRING,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('open', 'resolved'),
    defaultValue: 'open',
    allowNull: false
  }
}, {
  tableName: 'tickets'
});

export default Ticket;
