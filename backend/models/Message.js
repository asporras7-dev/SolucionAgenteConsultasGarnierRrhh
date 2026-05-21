import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const Message = sequelize.define('Message', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  sessionId: {
    type: DataTypes.STRING,
    allowNull: false,
    references: {
      model: 'sessions',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  role: {
    type: DataTypes.ENUM('user', 'assistant'),
    allowNull: false
  },
  content: {
    type: DataTypes.TEXT('medium'),
    allowNull: false
  },
  source: {
    type: DataTypes.TEXT, // Almacenado como JSON string (ej. { document_name, section, page })
    allowNull: true
  },
  confidence: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  escalated: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false
  },
  intent: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  tableName: 'messages'
});

export default Message;
