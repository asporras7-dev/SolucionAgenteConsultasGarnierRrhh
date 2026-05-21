import { initializeDatabase } from './config/dbInit.js';
import { sequelize, Employee, Document, DocumentChunk, Session, Message, Ticket, AnalyticsLog } from './models/index.js';
import { getEmbedding, calculateCosineSimilarity, generateRAGAnswer } from './services/ragService.js';
import { sendEmail } from './services/notificationService.js';
import { Op } from 'sequelize';

// --- DESPACHADOR LOCAL PARA TESTING DE LAS HERRAMIENTAS ---
async function callLocalTool(name, args) {
  switch (name) {
    case 'classify_query_intent': {
      const { query, employee_id, session_id } = args;
      const qLower = query.toLowerCase();

      const sensitiveWords = ['depresión', 'ansiedad', 'acoso', 'suicidio', 'duelo', 'violencia', 'burnout'];
      const isSensitive = sensitiveWords.some(word => qLower.includes(word));

      const onboardingWords = ['onboarding', 'inducción', 'ingreso', 'flujo', 'bienvenida'];
      const isOnboarding = onboardingWords.some(word => qLower.includes(word));

      let intent = 'STANDARD';
      let escalate = false;
      let reason = 'Normal standard policy inquiry';

      if (isSensitive) {
        intent = 'SENSITIVE';
        escalate = true;
        reason = 'sensitive_topic';
      } else if (isOnboarding) {
        intent = 'ONBOARDING';
        reason = 'onboarding_mode';
      }

      return { intent, confidence: 0.95, escalate, reason };
    }

    case 'search_policy_documents': {
      const { query, top_k = 3 } = args;
      return { answer: 'Respuesta simulada del RAG sobre políticas.', found: true, confidence: 0.85, source: { document_name: 'Manual de Políticas.pdf', section: 'Capítulo 4', page: 3 } };
    }

    case 'escalate_to_hr_agent': {
      const { employee_id, employee_name, query, reason, priority, session_id } = args;
      const ticketId = 'TKT' + Math.floor(100000 + Math.random() * 900000);
      return {
        empathetic_message: `Hola ${employee_name}, entendemos tu inquietud. Tu consulta ha sido trasladada al equipo de RRHH con prioridad ${priority}.`,
        ticket_id: ticketId,
        hr_notified: true,
        estimated_response: '2 horas'
      };
    }

    case 'start_onboarding_flow': {
      const { employee_id, employee_name, start_date } = args;
      return {
        flow_id: 'ONB' + Math.floor(100000 + Math.random() * 900000),
        steps: [{ step_number: 1, title: 'Bienvenida', description: 'Reunión inicial.' }],
        welcome_message: `¡Bienvenido a Garnier, ${employee_name}!`
      };
    }

    case 'get_hr_analytics': {
      return {
        data: {
          total_queries: 12,
          total_escalations: 3,
          unanswered_gaps: 2,
          accuracy_rate: 0.83
        }
      };
    }
  }
}

async function runToolTest(toolName, args) {
  console.log(`\n🧪 Probando Herramienta: [${toolName}]`);
  console.log(`   Argumentos: ${JSON.stringify(args)}`);
  try {
    const result = await callLocalTool(toolName, args);
    console.log(`✅ Resultado:`);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`❌ Error en la tool:`, error.message);
  }
}

async function runAllTests() {
  console.log('====================================================');
  console.log('🤖 INICIANDO PRUEBAS DEL SERVIDOR MCP RRHH GARNIER');
  console.log('====================================================');

  // Inicializar base de datos MySQL
  try {
    await initializeDatabase();
    console.log('📡 Conexión de base de datos MySQL inicializada.');
  } catch (dbErr) {
    console.warn('⚠️ Advertencia: No se pudo conectar a MySQL. Corriendo pruebas con mock data...');
  }

  try {
    // 1. Probar tool: classify_query_intent (Consulta estándar)
    await runToolTest('classify_query_intent', {
      query: '¿Cuántos días tengo de vacaciones al año?',
      employee_id: 'EMP002',
      session_id: 'SES_TEST_001'
    });

    // 2. Probar tool: classify_query_intent (Tema sensible)
    await runToolTest('classify_query_intent', {
      query: 'He estado sufriendo de mucha depresión y burnout por acoso',
      employee_id: 'EMP002',
      session_id: 'SES_TEST_002'
    });

    // 3. Probar tool: start_onboarding_flow
    await runToolTest('start_onboarding_flow', {
      employee_id: 'EMP003',
      employee_name: 'Luis Brenes',
      start_date: new Date().toISOString()
    });

    // 4. Probar tool: escalate_to_hr_agent
    await runToolTest('escalate_to_hr_agent', {
      employee_id: 'EMP002',
      employee_name: 'Sofía Delgado',
      query: '¿Puedo traer a mi mascota a la oficina?',
      reason: 'no_information',
      priority: 'low',
      session_id: 'SES_TEST_001'
    });

    // 5. Probar tool: search_policy_documents
    await runToolTest('search_policy_documents', {
      query: 'vacaciones',
      top_k: 2
    });

    // 6. Probar tool: get_hr_analytics
    const fromDate = new Date();
    fromDate.setMonth(fromDate.getMonth() - 1);
    await runToolTest('get_hr_analytics', {
      report_type: 'full_summary',
      from_date: fromDate.toISOString().split('T')[0],
      to_date: new Date().toISOString().split('T')[0]
    });

  } catch (error) {
    console.error('Error general en las pruebas:', error);
  } finally {
    console.log('\n🏁 Pruebas de integración de herramientas completadas.');
    try {
      await sequelize.close();
      console.log('🔒 Conexión de base de datos cerrada.');
    } catch(e) {}
  }
}

runAllTests();
