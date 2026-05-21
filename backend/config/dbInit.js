import mysql from 'mysql2/promise';
import { sequelize, Employee } from '../models/index.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

export async function initializeDatabase() {
  try {
    console.log('Verificando existencia de la base de datos MySQL...');
    
    // Conectar al servidor MySQL sin especificar base de datos para crearla si no existe
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'root'
    });

    const dbName = process.env.DB_NAME || 'garnier_rrhh';
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\`;`);
    await connection.end();
    console.log(`✅ Base de datos "${dbName}" verificada/creada.`);

    console.log('Conectando y sincronizando base de datos MySQL con Sequelize...');
    // Sincronizar modelos. Usamos alter: true para crear o modificar tablas sin destruir datos.
    await sequelize.sync({ alter: true });
    console.log('Base de datos MySQL sincronizada con éxito.');

    // Verificar si ya hay empleados precargados para evitar duplicados
    const count = await Employee.count();
    if (count === 0) {
      console.log('Sembrando empleados iniciales de prueba...');
      
      await Employee.bulkCreate([
        {
          id: 'EMP001',
          name: 'Carlos Garnier',
          email: 'carlos.garnier@garnier.com',
          role: 'hr_admin',
          startDate: new Date('2015-01-15')
        },
        {
          id: 'EMP002',
          name: 'Sofía Delgado',
          email: 'sofia.delgado@garnier.com',
          role: 'employee',
          startDate: new Date('2021-06-10')
        },
        {
          id: 'EMP003',
          name: 'Luis Brenes',
          email: 'luis.brenes@garnier.com',
          role: 'employee',
          startDate: new Date('2026-05-15'), // Colaborador nuevo para onboarding
          onboardingCompleted: false
        }
      ]);
      console.log('✅ Sembrado inicial completado.');
    }
  } catch (error) {
    console.error('⚠️ Error al conectar o inicializar la base de datos:', error.message);
    console.error('Asegúrese de que el servidor MySQL esté activo y que las credenciales en backend/.env sean válidas.');
  }
}
