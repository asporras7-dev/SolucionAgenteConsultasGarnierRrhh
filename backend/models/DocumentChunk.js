import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const DocumentChunk = sequelize.define('DocumentChunk', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  documentId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'documents',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  content: {
    type: DataTypes.TEXT('medium'),
    allowNull: false
  },
  page: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  section: {
    type: DataTypes.STRING,
    allowNull: true
  },
  embedding: {
    type: DataTypes.TEXT('long'), // Guardado como JSON stringificado del array de floats del embedding
    allowNull: false
  }
}, {
  tableName: 'document_chunks'
});

export default DocumentChunk;
