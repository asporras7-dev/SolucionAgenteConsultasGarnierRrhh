import sequelize from '../config/database.js';
import Employee from './Employee.js';
import Document from './Document.js';
import DocumentChunk from './DocumentChunk.js';
import Session from './Session.js';
import Message from './Message.js';
import Ticket from './Ticket.js';
import AnalyticsLog from './AnalyticsLog.js';

// Relaciones
Employee.hasMany(Session, { foreignKey: 'employeeId' });
Session.belongsTo(Employee, { foreignKey: 'employeeId' });

Session.hasMany(Message, { foreignKey: 'sessionId', onDelete: 'CASCADE' });
Message.belongsTo(Session, { foreignKey: 'sessionId' });

Document.hasMany(DocumentChunk, { foreignKey: 'documentId', onDelete: 'CASCADE' });
DocumentChunk.belongsTo(Document, { foreignKey: 'documentId' });

Employee.hasMany(Ticket, { foreignKey: 'employeeId' });
Ticket.belongsTo(Employee, { foreignKey: 'employeeId' });

export {
  sequelize,
  Employee,
  Document,
  DocumentChunk,
  Session,
  Message,
  Ticket,
  AnalyticsLog
};
