import sequelize from '../config/database.js';
import { DataTypes } from 'sequelize';

/**
 * Migración completa: crea todas las tablas de la base de datos.
 * Ejecutar con: node migrations/create-all-tables.js
 */
async function migrate() {
  const qi = sequelize.getQueryInterface();

  console.log('🚀 Iniciando migración de base de datos...\n');

  // ─── 1. employees ───────────────────────────────────────────
  console.log('  Creando tabla employees...');
  await qi.createTable('employees', {
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
      allowNull: false
    },
    role: {
      type: DataTypes.ENUM('employee', 'hr_admin'),
      defaultValue: 'employee',
      allowNull: false
    },
    start_date: {
      type: DataTypes.DATE,
      allowNull: true
    },
    onboarding_flow_id: {
      type: DataTypes.STRING,
      allowNull: true
    },
    onboarding_completed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  });
  console.log('  ✅ employees creada.');

  // ─── 2. documents ───────────────────────────────────────────
  console.log('  Creando tabla documents...');
  await qi.createTable('documents', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    file_name: {
      type: DataTypes.STRING,
      allowNull: true
    },
    category: {
      type: DataTypes.STRING,
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
    admin_id: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: ''
    },
    chunks_created: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  });
  console.log('  ✅ documents creada.');

  // ─── 3. document_chunks ─────────────────────────────────────
  console.log('  Creando tabla document_chunks...');
  await qi.createTable('document_chunks', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    document_id: {
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
      type: DataTypes.TEXT('long'),
      allowNull: false
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  });
  console.log('  ✅ document_chunks creada.');

  // ─── 4. sessions ────────────────────────────────────────────
  console.log('  Creando tabla sessions...');
  await qi.createTable('sessions', {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false
    },
    employee_id: {
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
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  });
  console.log('  ✅ sessions creada.');

  // ─── 5. messages ────────────────────────────────────────────
  console.log('  Creando tabla messages...');
  await qi.createTable('messages', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    session_id: {
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
      type: DataTypes.TEXT,
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
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  });
  console.log('  ✅ messages creada.');

  // ─── 6. tickets ─────────────────────────────────────────────
  console.log('  Creando tabla tickets...');
  await qi.createTable('tickets', {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false
    },
    employee_id: {
      type: DataTypes.STRING,
      allowNull: false,
      references: {
        model: 'employees',
        key: 'id'
      }
    },
    employee_name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    query: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    reason: {
      type: DataTypes.STRING,
      allowNull: false
    },
    priority: {
      type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
      defaultValue: 'low',
      allowNull: false
    },
    session_id: {
      type: DataTypes.STRING,
      allowNull: false
    },
    empathetic_message: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    hr_notified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false
    },
    estimated_response: {
      type: DataTypes.STRING,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('open', 'resolved'),
      defaultValue: 'open',
      allowNull: false
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  });
  console.log('  ✅ tickets creada.');

  // ─── 7. analytics_logs ─────────────────────────────────────
  console.log('  Creando tabla analytics_logs...');
  await qi.createTable('analytics_logs', {
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
    document_id: {
      type: DataTypes.UUID,
      allowNull: true
    },
    employee_id: {
      type: DataTypes.STRING,
      allowNull: false
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  });
  console.log('  ✅ analytics_logs creada.');

  console.log('\n🎉 Migración completada exitosamente. Todas las tablas fueron creadas.');
}

(async () => {
  try {
    await migrate();
  } catch (err) {
    console.error('❌ Error durante la migración:', err.message);
    // Si la tabla ya existe, el error es normal
    if (err.original && err.original.code === 'ER_TABLE_EXISTS_ERROR') {
      console.log('ℹ️  La tabla ya existía. Usa { force: true } en sequelize.sync() si deseas recrearla.');
    }
  } finally {
    await sequelize.close();
  }
})();
