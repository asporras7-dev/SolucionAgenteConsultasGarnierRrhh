import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

import {
  Employee,
  Document,
  DocumentChunk,
  Session,
  Message,
  Ticket,
  AnalyticsLog
} from '../models/index.js';

import {
  parsePdfToPages,
  createChunksFromPages,
  getEmbedding,
  calculateCosineSimilarity,
  generateRAGAnswer
} from '../services/ragService.js';

import { sendEmail } from '../services/notificationService.js';

import { Op } from 'sequelize';

// Crear Servidor MCP
export const mcpServer = new Server(
  {
    name: 'garnier-rrhh-server',
    version: '1.0.0'
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {}
    }
  }
);

// --- DEFINICIÓN DE RECURSOS ---
const RESOURCES = {
  'hr_policy_index': {
    uri: 'garnier://hr/documents/index',
    name: 'Índice de Políticas de RRHH',
    description: 'Índice de todos los documentos cargados en el sistema con su estado, categoría y fragmentos.',
    mimeType: 'application/json',
    handler: async () => {
      const docs = await Document.findAll();
      return JSON.stringify(docs, null, 2);
    }
  },
  'sensitive_topics_list': {
    uri: 'garnier://hr/config/sensitive-topics',
    name: 'Lista de Temas Sensibles',
    description: 'Lista configurable de palabras clave que activan escalamiento automático a RRHH.',
    mimeType: 'application/json',
    handler: async () => {
      const topics = [
        { word: 'depresión', priority: 'critical', category: 'salud_mental' },
        { word: 'ansiedad', priority: 'high', category: 'salud_mental' },
        { word: 'acoso', priority: 'critical', category: 'abuso' },
        { word: 'hostigamiento', priority: 'critical', category: 'abuso' },
        { word: 'suicidio', priority: 'critical', category: 'emergencia' },
        { word: 'duelo', priority: 'medium', category: 'salud_mental' },
        { word: 'violencia', priority: 'critical', category: 'emergencia' },
        { word: 'burnout', priority: 'medium', category: 'salud_mental' },
        { word: 'maltrato', priority: 'critical', category: 'abuso' }
      ];
      return JSON.stringify(topics, null, 2);
    }
  },
  'hr_contacts': {
    uri: 'garnier://hr/team/contacts',
    name: 'Contactos del Equipo de RRHH',
    description: 'Lista de contactos de RRHH con sus áreas de especialidad y correos corporativos.',
    mimeType: 'application/json',
    handler: async () => {
      const contacts = [
        { name: 'Diana Garnier', role: 'Directora de Desarrollo Humano', email: 'diana.garnier@garnier.com', specialty: 'General, Casos Sensibles y Compensaciones' },
        { name: 'Manuel Quirós', role: 'Generalista de RRHH', email: 'manuel.quiros@garnier.com', specialty: 'Salud Ocupacional, Licencias y Permisos' },
        { name: 'Andrea Monge', role: 'Encargada de Onboarding', email: 'andrea.monge@garnier.com', specialty: 'Inducción, Capacitaciones y Onboarding' }
      ];
      return JSON.stringify(contacts, null, 2);
    }
  },
  'onboarding_checklist': {
    uri: 'garnier://hr/onboarding/checklist',
    name: 'Checklist de Inducción de Nuevos Ingresos',
    description: 'Pistas y pasos que debe seguir un colaborador nuevo al ingresar a Garnier & Garnier.',
    mimeType: 'application/json',
    handler: async () => {
      const checklist = [
        { step_number: 1, title: 'Bienvenida e Inducción', description: 'Reunión inicial con el equipo y recorrido por la oficina.', source: 'Manual de Inducción, Sección 1' },
        { step_number: 2, title: 'Lectura de Políticas y Código de Ética', description: 'Firmar confirmación de lectura del Código de Conducta.', source: 'Código de Conducta Ética' },
        { step_number: 3, title: 'Entrega de Documentos Legales', description: 'Presentación de atestados, cuenta IBAN y registro CCSS.', source: 'Políticas de Contratación' },
        { step_number: 4, title: 'Configuración de Herramientas de Trabajo', description: 'Credenciales de correo y accesos a sistemas corporativos.', source: 'Guía de TI' },
        { step_number: 5, title: 'Reunión de Feedback (Primeras 2 semanas)', description: 'Espacio de preguntas con el líder directo.', source: 'Manual de Inducción, Sección 4' }
      ];
      return JSON.stringify(checklist, null, 2);
    }
  }
};

// --- DEFINICIÓN DE PROMPTS ---
const PROMPTS = {
  'hr_agent_system_prompt': {
    name: 'hr_agent_system_prompt',
    description: 'Instrucciones base sobre el tono, comportamiento y límites del agente conversacional.',
    arguments: [],
    prompt: `Eres el Asistente Conversacional Inteligente de Recursos Humanos de Garnier & Garnier. 
Tu objetivo es responder las dudas de los colaboradores de manera cálida, profesional y empática.

Sigue rigurosamente estas pautas:
1. Responde ÚNICAMENTE basándote en la información de los documentos oficiales que te son provistos como contexto.
2. Siempre cita la fuente al responder (ej: "Según la Política de Vacaciones (Sección 3.1, Página 7)...").
3. Si la información no está disponible en los documentos provistos, indica amablemente que no posees la información específica y que escalarás el caso al equipo de Recursos Humanos.
4. Si detectas consultas sensibles (como acoso laboral, crisis de salud mental, duelo, ideación suicida, etc.), escala de inmediato utilizando la herramienta de escalamiento correspondiente, respondiendo de manera extremadamente empática y reconfortante.
5. Nunca inventes información ni especules sobre normativas que no estén documentadas.
6. Responde en el mismo idioma en el que te escribe el colaborador (soporte español e inglés).`
  },
  'empathy_escalation_template': {
    name: 'empathy_escalation_template',
    description: 'Genera una plantilla de mensaje empático según el motivo del escalamiento.',
    arguments: [
      { name: 'reason', description: 'Motivo del escalamiento (no_information | sensitive_topic | urgent)', required: true },
      { name: 'employee_name', description: 'Nombre del colaborador', required: true }
    ],
    prompt: (args) => {
      const name = args.employee_name;
      if (args.reason === 'sensitive_topic') {
        return `Hola ${name}, entendemos que estás pasando por un momento muy difícil y queremos que sepas que en Garnier & Garnier no estás solo/a. Tu bienestar es lo más importante para nosotros. Hemos trasladado tu consulta con carácter confidencial y prioritario al equipo de Recursos Humanos, quienes se pondrán en contacto contigo de forma directa a la brevedad. Estamos aquí para apoyarte.`;
      } else if (args.reason === 'no_information') {
        return `Hola ${name}, gracias por consultarme. En este momento no dispongo de la información exacta en los reglamentos actuales para responderte de forma completa. He notificado formalmente a nuestro equipo de Recursos Humanos para que investiguen tu consulta y te brinden la respuesta oportuna muy pronto. ¡Que tengas un excelente día!`;
      } else {
        return `Hola ${name}, tu consulta ha sido escalada con alta prioridad al equipo de Recursos Humanos. Un especialista se estará comunicando contigo en las próximas horas para atender tu caso de forma personalizada.`;
      }
    }
  },
  'onboarding_welcome_template': {
    name: 'onboarding_welcome_template',
    description: 'Mensaje de bienvenida y presentación del flujo de onboarding para nuevos colaboradores.',
    arguments: [
      { name: 'employee_name', description: 'Nombre del colaborador nuevo', required: true },
      { name: 'start_date', description: 'Fecha de ingreso', required: true }
    ],
    prompt: (args) => {
      return `¡Te damos la más cálida bienvenida a Garnier & Garnier, ${args.employee_name}! 🚀\nEstamos muy emocionados de que formes parte de nuestra familia a partir del ${new Date(args.start_date).toLocaleDateString('es-CR')}.\n\nHe activado tu Flujo de Inducción Guiado. Podrás ir completando cada módulo y consultar tus dudas en cualquier momento. ¡Mucho éxito en este nuevo camino!`;
    }
  }
};

// --- REGISTRO DE MANEJADORES MCP ---

// Listar Herramientas
mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'classify_query_intent',
        description: 'Analiza la pregunta del colaborador y clasifica su intención para derivar el flujo adecuado.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Texto de la consulta' },
            employee_id: { type: 'string', description: 'ID del colaborador' },
            session_id: { type: 'string', description: 'ID de sesión' }
          },
          required: ['query', 'employee_id', 'session_id']
        }
      },
      {
        name: 'search_policy_documents',
        description: 'Realiza búsqueda semántica RAG sobre los documentos cargados para responder la consulta.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Pregunta del colaborador en lenguaje natural' },
            language: { type: 'string', enum: ['es', 'en'], default: 'es' },
            document_ids: { type: 'array', items: { type: 'string' }, description: 'IDs opcionales de documentos a filtrar' },
            top_k: { type: 'integer', default: 3, description: 'Número de fragmentos a retornar' }
          },
          required: ['query']
        }
      },
      {
        name: 'escalate_to_hr_agent',
        description: 'Crea un ticket en el sistema y escala la duda a un humano en RRHH, notificando por correo.',
        inputSchema: {
          type: 'object',
          properties: {
            employee_id: { type: 'string' },
            employee_name: { type: 'string' },
            query: { type: 'string' },
            reason: { type: 'string', enum: ['no_information', 'sensitive_topic', 'urgent', 'recurring_unanswered', 'employee_request'] },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
            session_id: { type: 'string' },
            language: { type: 'string', default: 'es' }
          },
          required: ['employee_id', 'employee_name', 'query', 'reason', 'priority', 'session_id']
        }
      },
      {
        name: 'upload_policy_document',
        description: 'Carga un nuevo PDF (Base64), lo parsea, segmenta y vectoriza en la BD.',
        inputSchema: {
          type: 'object',
          properties: {
            file_name: { type: 'string' },
            file_base64: { type: 'string', description: 'Contenido del PDF en formato base64' },
            category: { type: 'string' },
            language: { type: 'string', default: 'es' },
            active: { type: 'boolean', default: true },
            admin_id: { type: 'string' }
          },
          required: ['file_name', 'file_base64', 'category', 'admin_id']
        }
      },
      {
        name: 'manage_document_status',
        description: 'Activa o desactiva la disponibilidad de búsqueda de un documento PDF.',
        inputSchema: {
          type: 'object',
          properties: {
            document_id: { type: 'string' },
            action: { type: 'string', enum: ['activate', 'deactivate'] },
            admin_id: { type: 'string' },
            reason: { type: 'string' }
          },
          required: ['document_id', 'action', 'admin_id']
        }
      },
      {
        name: 'get_conversation_history',
        description: 'Recupera los mensajes anteriores de una sesión de chat o de un colaborador.',
        inputSchema: {
          type: 'object',
          properties: {
            session_id: { type: 'string' },
            employee_id: { type: 'string' },
            limit: { type: 'integer', default: 50 },
            from_date: { type: 'string' },
            to_date: { type: 'string' }
          }
        }
      },
      {
        name: 'get_hr_analytics',
        description: 'Obtiene estadísticas de uso del bot: intenciones, temas frecuentes y brechas.',
        inputSchema: {
          type: 'object',
          properties: {
            report_type: { type: 'string', enum: ['top_queries', 'unanswered_queries', 'escalations', 'document_usage', 'full_summary'] },
            from_date: { type: 'string' },
            to_date: { type: 'string' },
            format: { type: 'string', default: 'json' }
          },
          required: ['report_type', 'from_date', 'to_date']
        }
      },
      {
        name: 'send_hr_notification',
        description: 'Envía un correo corporativo al equipo de RRHH mediante Nodemailer/Ethereal.',
        inputSchema: {
          type: 'object',
          properties: {
            notification_type: { type: 'string' },
            recipients: { type: 'array', items: { type: 'string' } },
            subject: { type: 'string' },
            body: { type: 'string' },
            priority: { type: 'string' },
            metadata: { type: 'object' }
          },
          required: ['notification_type', 'recipients', 'subject', 'body', 'priority']
        }
      },
      {
        name: 'start_onboarding_flow',
        description: 'Inicia el flujo guiado de inducción de un colaborador nuevo.',
        inputSchema: {
          type: 'object',
          properties: {
            employee_id: { type: 'string' },
            employee_name: { type: 'string' },
            start_date: { type: 'string' },
            language: { type: 'string', default: 'es' }
          },
          required: ['employee_id', 'employee_name', 'start_date']
        }
      }
    ]
  };
});

// Invocar Herramientas
mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'classify_query_intent': {
        const { query, employee_id, session_id } = args;
        const qLower = query.toLowerCase();

        // 1. Detectar temas sensibles basados en las palabras del recurso sensitive_topics_list
        const sensitiveWords = ['depresión', 'ansiedad', 'acoso', 'suicidio', 'duelo', 'violencia', 'burnout', 'maltrato', 'hostigamiento', 'morir', 'llorar'];
        const isSensitive = sensitiveWords.some(word => qLower.includes(word));

        // 2. Detectar onboarding
        const onboardingWords = ['onboarding', 'inducción', 'ingreso', 'flujo', 'comenzar', 'bienvenida', 'checklist'];
        const isOnboarding = onboardingWords.some(word => qLower.includes(word));

        // 3. Detectar urgencias directas
        const urgentWords = ['urgente', 'emergencia', 'accidente', 'inmediato', 'auxilio'];
        const isUrgent = urgentWords.some(word => qLower.includes(word));

        let intent = 'STANDARD';
        let suggested_tool = 'search_policy_documents';
        let escalate = false;
        let reason = 'Normal standard policy inquiry';

        if (isSensitive) {
          intent = 'SENSITIVE';
          suggested_tool = 'escalate_to_hr_agent';
          escalate = true;
          reason = 'sensitive_topic';
        } else if (isUrgent) {
          intent = 'URGENT';
          suggested_tool = 'escalate_to_hr_agent';
          escalate = true;
          reason = 'urgent';
        } else if (isOnboarding) {
          intent = 'ONBOARDING';
          suggested_tool = 'start_onboarding_flow';
          reason = 'onboarding_mode';
        }

        // Registrar en Analytics log
        await AnalyticsLog.create({
          query,
          intent,
          confidence: 0.95,
          found: true,
          escalated: escalate,
          employeeId: employee_id
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              intent,
              confidence: 0.95,
              escalate,
              reason,
              suggested_tool
            })
          }]
        };
      }

      case 'search_policy_documents': {
        const { query, language = 'es', document_ids = [], top_k = 3 } = args;
        const queryEmbedding = await getEmbedding(query);

        // Buscar documentos activos
        const docFilter = { active: true };
        if (document_ids && document_ids.length > 0) {
          docFilter.id = { [Op.in]: document_ids };
        }
        const activeDocs = await Document.findAll({ where: docFilter });
        const activeDocIds = activeDocs.map(d => d.id);

        if (activeDocIds.length === 0) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                answer: 'No hay documentos de políticas activos en el sistema.',
                source: null,
                confidence: 0.0,
                found: false
              })
            }]
          };
        }

        // Obtener fragmentos
        const chunks = await DocumentChunk.findAll({
          where: { documentId: { [Op.in]: activeDocIds } }
        });

        // Calcular similitud en JS
        const scoredChunks = chunks.map(chunk => {
          const chunkEmb = JSON.parse(chunk.embedding);
          const similarity = calculateCosineSimilarity(queryEmbedding, chunkEmb);
          const doc = activeDocs.find(d => d.id === chunk.documentId);
          return {
            content: chunk.content,
            documentName: doc ? doc.fileName : 'Desconocido',
            documentId: chunk.documentId,
            section: chunk.section || 'General',
            page: chunk.page || 1,
            similarity
          };
        });

        // Ordenar por similitud
        scoredChunks.sort((a, b) => b.similarity - a.similarity);
        const topChunks = scoredChunks.slice(0, top_k);

        // Umbral mínimo de similitud
        const bestScore = topChunks.length > 0 ? topChunks[0].similarity : 0;
        const threshold = 0.15; // Umbral ajustado para embeddings locales por hashing

        if (topChunks.length === 0 || bestScore < threshold) {
          // No se encontró información relevante
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                answer: '',
                source: null,
                confidence: bestScore,
                found: false
              })
            }]
          };
        }

        // Generar respuesta
        const systemPromptObj = PROMPTS.hr_agent_system_prompt;
        const ragResult = await generateRAGAnswer(systemPromptObj.prompt, topChunks, query);

        // Registrar en analytics
        if (ragResult.found) {
          await AnalyticsLog.create({
            query,
            intent: 'STANDARD',
            confidence: bestScore,
            found: true,
            escalated: false,
            documentId: topChunks[0].documentId,
            employeeId: 'UNKNOWN' // Se actualizará en el endpoint Express
          });
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(ragResult)
          }]
        };
      }

      case 'escalate_to_hr_agent': {
        const { employee_id, employee_name, query, reason, priority, session_id, language = 'es' } = args;

        const ticketId = 'TKT' + Math.floor(100000 + Math.random() * 900000);
        const estimatedResponse = priority === 'critical' ? 'Inmediata (menos de 2 horas)' : (priority === 'high' ? '4 horas' : '1 día hábil');

        // Generar mensaje empático basado en prompt
        const templatePrompt = PROMPTS.empathy_escalation_template.prompt({
          reason,
          employee_name
        });

        // Guardar ticket en BD
        await Ticket.create({
          id: ticketId,
          employeeId: employee_id,
          employeeName: employee_name,
          query,
          reason,
          priority,
          sessionId: session_id,
          empatheticMessage: templatePrompt,
          hrNotified: true,
          estimatedResponse,
          status: 'open'
        });

        // Modificar estado del último mensaje o registrar escalamiento en log
        await AnalyticsLog.create({
          query,
          intent: reason.toUpperCase(),
          confidence: 1.0,
          found: false,
          escalated: true,
          employeeId: employee_id
        });

        // Notificar a RRHH por correo
        const mailBody = `
=== ALERTA DE ESCALAMIENTO RRHH — GARNIER & GARNIER ===
Ticket ID:      ${ticketId}
Prioridad:      ${priority.toUpperCase()}
Colaborador:    ${employee_name} (ID: ${employee_id})
Sesión ID:      ${session_id}
Motivo:         ${reason}
Consulta:       "${query}"

Por favor, atienda este caso ingresando al Panel de Administración de RRHH.
        `;

        const hrEmailResult = await sendEmail({
          subject: `[${priority.toUpperCase()}] Escalamiento RRHH - Ticket ${ticketId} (${employee_name})`,
          text: mailBody
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              empathetic_message: templatePrompt,
              ticket_id: ticketId,
              hr_notified: true,
              estimated_response: estimatedResponse,
              mail_preview_url: hrEmailResult.previewUrl
            })
          }]
        };
      }

      case 'upload_policy_document': {
        const { file_name, file_base64, category, language = 'es', active = true, admin_id } = args;

        const buffer = Buffer.from(file_base64, 'base64');
        const pages = await parsePdfToPages(buffer);
        const chunks = createChunksFromPages(pages);

        // Guardar Documento en BD
        const doc = await Document.create({
          fileName: file_name,
          category,
          language,
          active,
          adminId: admin_id,
          chunksCreated: chunks.length
        });

        // Generar embeddings y guardar Chunks
        for (const ch of chunks) {
          const emb = await getEmbedding(ch.content);
          await DocumentChunk.create({
            documentId: doc.id,
            content: ch.content,
            page: ch.page,
            section: ch.section,
            embedding: JSON.stringify(emb)
          });
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              document_id: doc.id,
              chunks_created: chunks.length,
              status: 'success',
              message: `El documento "${file_name}" fue procesado, fragmentado en ${chunks.length} partes y almacenado en MySQL con éxito.`
            })
          }]
        };
      }

      case 'manage_document_status': {
        const { document_id, action, admin_id, reason = '' } = args;
        const doc = await Document.findByPk(document_id);

        if (!doc) {
          throw new Error('Documento no encontrado.');
        }

        const isActivate = action === 'activate';
        await doc.update({ active: isActivate });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              document_id,
              new_status: isActivate ? 'active' : 'inactive',
              updated_at: new Date().toISOString(),
              success: true
            })
          }]
        };
      }

      case 'get_conversation_history': {
        const { session_id, employee_id, limit = 50, from_date, to_date } = args;

        const queryFilter = {};
        if (session_id) {
          queryFilter.sessionId = session_id;
        } else if (employee_id) {
          // Buscar sesiones de este empleado
          const sessions = await Session.findAll({ where: { employeeId: employee_id } });
          const sessionIds = sessions.map(s => s.id);
          queryFilter.sessionId = { [Op.in]: sessionIds };
        } else {
          throw new Error('Debe proveer session_id o employee_id.');
        }

        if (from_date || to_date) {
          queryFilter.createdAt = {};
          if (from_date) queryFilter.createdAt[Op.gte] = new Date(from_date);
          if (to_date) queryFilter.createdAt[Op.lte] = new Date(to_date);
        }

        const msgs = await Message.findAll({
          where: queryFilter,
          order: [['createdAt', 'ASC']],
          limit
        });

        const formattedMsgs = msgs.map(m => ({
          role: m.role,
          content: m.content,
          timestamp: m.createdAt.toISOString(),
          source: m.source ? JSON.parse(m.source) : null,
          escalated: m.escalated
        }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              messages: formattedMsgs,
              total_messages: formattedMsgs.length
            })
          }]
        };
      }

      case 'get_hr_analytics': {
        const { report_type, from_date, to_date } = args;
        
        const filter = {
          createdAt: {
            [Op.between]: [new Date(from_date), new Date(to_date)]
          }
        };

        let reportData = [];

        if (report_type === 'top_queries') {
          // Consultas agrupadas
          const logs = await AnalyticsLog.findAll({
            where: { ...filter, intent: 'STANDARD' },
            attributes: ['query', [sequelize.fn('count', sequelize.col('id')), 'count']],
            group: ['query'],
            order: [[sequelize.literal('count'), 'DESC']],
            limit: 10
          });
          reportData = logs.map(l => ({
            query: l.query,
            count: parseInt(l.get('count'), 10),
            last_asked: new Date().toISOString()
          }));
        } else if (report_type === 'unanswered_queries') {
          const logs = await AnalyticsLog.findAll({
            where: { ...filter, found: false },
            attributes: ['query', [sequelize.fn('count', sequelize.col('id')), 'count'], 'escalated'],
            group: ['query', 'escalated'],
            order: [[sequelize.literal('count'), 'DESC']],
            limit: 10
          });
          reportData = logs.map(l => ({
            query: l.query,
            count: parseInt(l.get('count'), 10),
            escalated: l.escalated
          }));
        } else if (report_type === 'escalations') {
          const tickets = await Ticket.findAll({
            where: filter,
            attributes: ['reason', 'priority', [sequelize.fn('count', sequelize.col('id')), 'count']],
            group: ['reason', 'priority']
          });
          reportData = tickets.map(t => ({
            reason: t.reason,
            priority: t.priority,
            count: parseInt(t.get('count'), 10),
            avg_response_time: t.priority === 'critical' ? '2h' : '24h'
          }));
        } else if (report_type === 'document_usage') {
          const logs = await AnalyticsLog.findAll({
            where: { ...filter, documentId: { [Op.ne]: null } },
            attributes: ['documentId', [sequelize.fn('count', sequelize.col('id')), 'count']],
            group: ['documentId'],
            limit: 10
          });
          
          const docUsage = [];
          for (const log of logs) {
            const doc = await Document.findByPk(log.documentId);
            docUsage.push({
              document_name: doc ? doc.fileName : 'Desconocido',
              query_count: parseInt(log.get('count'), 10),
              avg_confidence: 0.88
            });
          }
          reportData = docUsage;
        } else if (report_type === 'full_summary') {
          const totalQueries = await AnalyticsLog.count({ where: filter });
          const totalEscalations = await Ticket.count({ where: filter });
          const unanswered = await AnalyticsLog.count({ where: { ...filter, found: false } });

          reportData = {
            total_queries: totalQueries,
            total_escalations: totalEscalations,
            unanswered_gaps: unanswered,
            accuracy_rate: totalQueries > 0 ? parseFloat(((totalQueries - unanswered) / totalQueries).toFixed(2)) : 1.0
          };
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              report_type,
              period: { from_date, to_date },
              data: reportData,
              generated_at: new Date().toISOString()
            })
          }]
        };
      }

      case 'send_hr_notification': {
        const { notification_type, recipients, subject, body, priority, metadata = {} } = args;

        const textBody = `
TIPO ALERTA: ${notification_type.toUpperCase()}
PRIORIDAD:   ${priority.toUpperCase()}

${body}

---
Generado automáticamente por el Servidor MCP RRHH de Garnier.
Detalles: ${JSON.stringify(metadata, null, 2)}
        `;

        const mailResult = await sendEmail({
          to: recipients.join(','),
          subject,
          text: textBody
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              sent: true,
              message_id: mailResult.messageId,
              recipients_ok: recipients,
              timestamp: mailResult.timestamp,
              mail_preview_url: mailResult.previewUrl
            })
          }]
        };
      }

      case 'start_onboarding_flow': {
        const { employee_id, employee_name, start_date, language = 'es' } = args;
        const flowId = 'ONB' + Math.floor(100000 + Math.random() * 900000);

        // Actualizar el empleado en BD
        const emp = await Employee.findByPk(employee_id);
        if (emp) {
          await emp.update({
            onboardingFlowId: flowId,
            onboardingCompleted: false
          });
        }

        // Obtener el recurso onboarding_checklist
        const checklistStr = await RESOURCES.onboarding_checklist.handler();
        const steps = JSON.parse(checklistStr);

        // Obtener mensaje de bienvenida
        const welcomeText = PROMPTS.onboarding_welcome_template.prompt({
          employee_name,
          start_date
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              flow_id: flowId,
              steps,
              welcome_message: welcomeText,
              estimated_time: '2 semanas (ritmo sugerido)'
            })
          }]
        };
      }

      default:
        throw new Error(`Herramienta no implementada: ${name}`);
    }
  } catch (error) {
    return {
      isError: true,
      content: [{
        type: 'text',
        text: `Error ejecutando la herramienta ${name}: ${error.message}`
      }]
    };
  }
});

// --- RECURSOS MANEJADORES ---

// Listar Recursos
mcpServer.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: Object.keys(RESOURCES).map(key => ({
      uri: RESOURCES[key].uri,
      name: RESOURCES[key].name,
      description: RESOURCES[key].description,
      mimeType: RESOURCES[key].mimeType
    }))
  };
});

// Leer Recurso
mcpServer.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  const resourceKey = Object.keys(RESOURCES).find(k => RESOURCES[k].uri === uri);

  if (!resourceKey) {
    throw new Error(`Recurso no encontrado: ${uri}`);
  }

  const content = await RESOURCES[resourceKey].handler();

  return {
    contents: [{
      uri,
      mimeType: RESOURCES[resourceKey].mimeType,
      text: content
    }]
  };
});

// --- PROMPTS MANEJADORES ---

// Listar Prompts
mcpServer.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: Object.keys(PROMPTS).map(key => ({
      name: PROMPTS[key].name,
      description: PROMPTS[key].description,
      arguments: PROMPTS[key].arguments
    }))
  };
});

// Obtener Prompt
mcpServer.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const promptKey = Object.keys(PROMPTS).find(k => PROMPTS[k].name === name);

  if (!promptKey) {
    throw new Error(`Prompt no encontrado: ${name}`);
  }

  let promptText = '';
  const promptObj = PROMPTS[promptKey];
  if (typeof promptObj.prompt === 'function') {
    promptText = promptObj.prompt(args || {});
  } else {
    promptText = promptObj.prompt;
  }

  return {
    description: promptObj.description,
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: promptText
        }
      }
    ]
  };
});
