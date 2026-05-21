import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const AnalyticsLog = sequelize.define('AnalyticsLog', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  query: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  intent: {
    type: DataTypes.STRING,
    allowNull: false
  },
  confidence: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  found: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false
  },
  escalated: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false
  },
  documentId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  employeeId: {
    type: DataTypes.STRING,
    allowNull: false
  }
}, {
  tableName: 'analytics_logs'
});

export default AnalyticsLog;
