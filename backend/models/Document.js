import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const Document = sequelize.define('Document', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  fileName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  category: {
    type: DataTypes.STRING, // 'politica_interna', 'normativa_legal', 'codigo_conducta', etc.
    allowNull: true
  },
  language: {
    type: DataTypes.STRING(10),
    defaultValue: 'es',
    allowNull: true
  },
  active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: true
  },
  adminId: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: ''
  },
  chunksCreated: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: true
  }
}, {
  tableName: 'documents'
});

export default Document;
