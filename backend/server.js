import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';

import { initializeDatabase } from './config/dbInit.js';
import { mcpServer } from './mcp/mcpServer.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { Op } from 'sequelize';

import {
  sequelize,
  Employee,
  Document,
  DocumentChunk,
  Session,
  Message,
  Ticket,
  AnalyticsLog
} from './models/index.js';

import {
  getEmbedding,
  calculateCosineSimilarity,
  generateRAGAnswer,
  parsePdfToPages,
  createChunksFromPages
} from './services/ragService.js';

import { sendEmail } from './services/notificationService.js';
import { translateText } from './services/translationService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const upload = multer({ limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB

// --- DESPACHADOR LOCAL DE HERRAMIENTAS MCP (Para el API Chat) ---
async function callLocalTool(name, args) {
  switch (name) {
    case 'classify_query_intent': {
      const { query, employee_id, session_id, language = 'es' } = args;
      const qLower = query.toLowerCase();

      // Detectar temas sensibles (Español e Inglés)
      const sensitiveWords = [
        'depresión', 'ansiedad', 'acoso', 'suicidio', 'duelo', 'violencia', 'burnout', 'maltrato', 'hostigamiento', 'morir', 'llorar',
        'depression', 'anxiety', 'harassment', 'suicide', 'grief', 'violence', 'abuse', 'hostility', 'dying', 'die', 'cry'
      ];
      const isSensitive = sensitiveWords.some(word => qLower.includes(word));

      // Detectar onboarding (Español e Inglés)
      const onboardingWords = [
        'onboarding', 'inducción', 'ingreso', 'flujo', 'comenzar', 'bienvenida', 'checklist',
        'induction', 'welcome', 'join', 'hiring'
      ];
      const isOnboarding = onboardingWords.some(word => qLower.includes(word));

      // Detectar urgencias directas (Español e Inglés)
      const urgentWords = [
        'urgente', 'emergencia', 'accidente', 'inmediato', 'auxilio',
        'urgent', 'emergency', 'accident', 'immediate', 'help', 'sos'
      ];
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

      await AnalyticsLog.create({
        query,
        intent,
        confidence: 0.95,
        found: true,
        escalated: escalate,
        employeeId: employee_id
      });

      return { intent, confidence: 0.95, escalate, reason, suggested_tool };
    }

    case 'search_policy_documents': {
      const { query, top_k = 3, language = 'es' } = args;
      // If the request is in English, translate the query to Spanish for better matching
      let effectiveQuery = query;
      if (language && language.toLowerCase() === 'en') {
        effectiveQuery = await translateText(query, 'es');
      }
      const queryEmbedding = await getEmbedding(effectiveQuery);

      // Search documents in the session language (or fallback to any language)
      let activeDocs = await Document.findAll({ where: { active: true, language } });
      if (activeDocs.length === 0) {
        activeDocs = await Document.findAll({ where: { active: true } });
      }
      const activeDocIds = activeDocs.map(d => d.id);

      if (activeDocIds.length === 0) {
        return { answer: '', source: null, confidence: 0.0, found: false };
      }

      const chunks = await DocumentChunk.findAll({
        where: { documentId: { [Op.in]: activeDocIds } }
      });

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

      scoredChunks.sort((a, b) => b.similarity - a.similarity);
      const topChunks = scoredChunks.slice(0, top_k);

      const bestScore = topChunks.length > 0 ? topChunks[0].similarity : 0;
      const threshold = 0.15; // Adjusted threshold for local hash embeddings

      if (topChunks.length === 0 || bestScore < threshold) {
        return { answer: '', source: null, confidence: bestScore, found: false };
      }

      // Run RAG in Spanish (language = 'es') regardless of original request language
      const systemPromptBase = `Eres el Asistente de RRHH de Garnier. Responde basándote solo en el contexto y cita la fuente.`;
      const systemPromptEn = `You are the HR Assistant for Garnier. Answer ONLY in English, using the provided Spanish context, translating any relevant information. Cite the source (document name, section, page). Do not include any Spanish text in the answer.`;
      const systemPrompt = (language && language.toLowerCase() === 'en') ? systemPromptEn : systemPromptBase;
      const ragResult = await generateRAGAnswer(systemPrompt, topChunks, effectiveQuery, 'es');

      // If original request was English, translate the answer back to English
      if (language && language.toLowerCase() === 'en') {
        const translatedAnswer = await translateText(ragResult.answer, 'en');
        ragResult.answer = translatedAnswer.replace(/^\[EN\]\s*/i, '').trim();
        // Optionally translate source fields (document name and section)
        if (ragResult.source) {
          ragResult.source.document_name = (await translateText(ragResult.source.document_name, 'en')).replace(/^\[EN\]\s*/i, '').trim();
          ragResult.source.section = (await translateText(ragResult.source.section, 'en')).replace(/^\[EN\]\s*/i, '').trim();
        }
      }

      // Log analytics
      await AnalyticsLog.create({
        query,
        intent: 'STANDARD',
        confidence: bestScore,
        found: true,
        escalated: false,
        documentId: topChunks[0].documentId,
        employeeId: args.employee_id || 'UNKNOWN'
      });

      return ragResult;
    }

    case 'escalate_to_hr_agent': {
      const { employee_id, employee_name, query, reason, priority, session_id, language = 'es' } = args;
      const ticketId = 'TKT' + Math.floor(100000 + Math.random() * 900000);
      
      const isEn = language.toLowerCase() === 'en';
      let estimatedResponse = '';
      if (isEn) {
        estimatedResponse = priority === 'critical' ? 'Immediate (less than 2 hours)' : (priority === 'high' ? '4 hours' : '1 business day');
      } else {
        estimatedResponse = priority === 'critical' ? 'Inmediata (menos de 2 horas)' : (priority === 'high' ? '4 horas' : '1 día hábil');
      }

      // Plantillas empáticas adaptadas al idioma
      let empatheticMsg = '';
      if (isEn) {
        if (reason === 'sensitive_topic') {
          empatheticMsg = `Hello ${employee_name}, we understand you are going through a difficult time and we want you to know you are not alone. Your inquiry is very important to us and has been escalated with high priority and absolute confidentiality to the Human Resources team, who will contact you directly as soon as possible. We are here to support you.`;
        } else if (reason === 'no_information') {
          empatheticMsg = `Hello ${employee_name}, thank you for reaching out. At the moment, I do not have the specific information in the policy documents to answer you accurately. I have formally notified the Human Resources team to investigate your query and provide you with a complete answer as soon as possible. You will hear from them soon.`;
        } else {
          empatheticMsg = `Hello ${employee_name}, your inquiry has been escalated with high priority to the Human Resources team. A specialist will contact you to assist you personally.`;
        }
      } else {
        if (reason === 'sensitive_topic') {
          empatheticMsg = `Hola ${employee_name}, entendemos que estás pasando por un momento difícil y queremos que sepas que no estás solo/a. Tu consulta es importante para nosotros y ha sido trasladada con prioridad y absoluta confidencialidad al equipo de Recursos Humanos, quien se pondrá en contacto contigo de forma directa a la brevedad. Estamos aquí para apoyarte.`;
        } else if (reason === 'no_information') {
          empatheticMsg = `Hola ${employee_name}, gracias por consultarme. En este momento no cuento con la información específica en los reglamentos para responderte con exactitud. He notificado formalmente al equipo de Recursos Humanos para que investiguen tu consulta y puedan darte una respuesta completa a la brevedad. Pronto recibirás noticias de ellos.`;
        } else {
          empatheticMsg = `Hola ${employee_name}, tu consulta ha sido escalada con alta prioridad al equipo de Recursos Humanos. Un especialista se estará comunicando contigo para atender tu caso de forma personalizada.`;
        }
      }

      await Ticket.create({
        id: ticketId,
        employeeId: employee_id,
        employeeName: employee_name,
        query,
        reason,
        priority,
        sessionId: session_id,
        empatheticMessage: empatheticMsg,
        hrNotified: true,
        estimatedResponse,
        status: 'open'
      });

      const mailBody = `
=== ALERTA DE ESCALAMIENTO RRHH — GARNIER & GARNIER ===
Ticket ID:      ${ticketId}
Prioridad:      ${priority.toUpperCase()}
Colaborador:    ${employee_name} (ID: ${employee_id})
Sesión ID:      ${session_id}
Motivo:         ${reason}
Consulta:       "${query}"

Por favor, revise este caso ingresando al Panel de Administración.
      `;

      const hrEmailResult = await sendEmail({
        subject: `[${priority.toUpperCase()}] Escalamiento RRHH - Ticket ${ticketId} (${employee_name})`,
        text: mailBody
      });

      return {
        empathetic_message: empatheticMsg,
        ticket_id: ticketId,
        hr_notified: true,
        estimated_response: estimatedResponse,
        mail_preview_url: hrEmailResult.previewUrl
      };
    }

    case 'start_onboarding_flow': {
      const { employee_id, employee_name, start_date, language = 'es' } = args;
      const flowId = 'ONB' + Math.floor(100000 + Math.random() * 900000);

      const emp = await Employee.findByPk(employee_id);
      if (emp) {
        await emp.update({
          onboardingFlowId: flowId,
          onboardingCompleted: false
        });
      }

      const isEn = language.toLowerCase() === 'en';
      let steps = [];
      let welcome_message = '';

      if (isEn) {
        steps = [
          { step_number: 1, title: 'Welcome and Induction', description: 'Initial meeting and office tour.', source: 'Induction Manual, Section 1' },
          { step_number: 2, title: 'Policy Reading and Code of Ethics', description: 'Sign confirmation of reading the Code of Conduct.', source: 'Code of Ethical Conduct' },
          { step_number: 3, title: 'Submission of Legal Documents', description: 'Submission of certificates, IBAN account, and CCSS registration.', source: 'Hiring Policies' },
          { step_number: 4, title: 'Tools Setup', description: 'Email credentials and system access.', source: 'IT Guide' },
          { step_number: 5, title: 'Feedback Meeting', description: 'Q&A session with your direct lead.', source: 'Induction Manual, Section 4' }
        ];

        const dateStr = new Date(start_date).toLocaleDateString('en-US');
        welcome_message = `We give you the warmest welcome to Garnier & Garnier, ${employee_name}! 🚀\nWe are excited to have you with us starting on ${dateStr}.\n\nI have activated your Guided Onboarding Flow. You will be able to see your pending tasks and solve any questions with me at any time. Much success in this new phase!`;
      } else {
        steps = [
          { step_number: 1, title: 'Bienvenida e Inducción', description: 'Reunión inicial y recorrido por la oficina.', source: 'Manual de Inducción, Sección 1' },
          { step_number: 2, title: 'Lectura de Políticas y Código de Ética', description: 'Firmar confirmación de lectura del Código de Conducta.', source: 'Código de Conducta Ética' },
          { step_number: 3, title: 'Entrega de Documentos Legales', description: 'Presentación de atestados, cuenta IBAN y registro CCSS.', source: 'Políticas de Contratación' },
          { step_number: 4, title: 'Configuración de Herramientas', description: 'Credenciales de correo y accesos.', source: 'Guía de TI' },
          { step_number: 5, title: 'Reunión de Feedback', description: 'Espacio de preguntas con el líder directo.', source: 'Manual de Inducción, Sección 4' }
        ];

        const dateStr = new Date(start_date).toLocaleDateString('es-CR');
        welcome_message = `¡Te damos la más cálida bienvenida a Garnier & Garnier, ${employee_name}! 🚀\nEstamos emocionados de tenerte con nosotros a partir del ${dateStr}.\n\nHe activado tu Flujo de Inducción Guiado. Podrás ver tus tareas pendientes y resolver dudas conmigo en cualquier momento. ¡Mucho éxito en esta nueva etapa!`;
      }

      return { flow_id: flowId, steps, welcome_message };
    }

    case 'upload_policy_document': {
      const { file_name, file_base64, category, language, active, admin_id } = args;
      const pdfBuffer = Buffer.from(file_base64, 'base64');
      const pages = await parsePdfToPages(pdfBuffer);
      const chunks = createChunksFromPages(pages);

      const doc = await Document.create({
        fileName: file_name,
        category,
        language,
        active: active !== false,
        uploadedBy: admin_id,
        chunksCreated: chunks.length
      });

      const chunkRecords = [];
      for (const ch of chunks) {
        const textToEmbed = `${ch.section || ''} ${ch.content}`;
        const embedding = await getEmbedding(textToEmbed);
        chunkRecords.push({
          documentId: doc.id,
          content: ch.content,
          section: ch.section,
          page: ch.page,
          embedding: JSON.stringify(embedding)
        });
      }

      await DocumentChunk.bulkCreate(chunkRecords);
      return { success: true, document_id: doc.id, chunks_created: chunks.length };
    }

    case 'manage_document_status': {
      const { document_id, action, admin_id, reason } = args;
      const doc = await Document.findByPk(document_id);
      if (!doc) {
        throw new Error('Documento no encontrado.');
      }
      doc.active = action === 'activate';
      await doc.save();
      return { success: true, document_id, active: doc.active };
    }

    case 'get_hr_analytics': {
      const { report_type, from_date, to_date } = args;
      const start = new Date(from_date);
      const end = new Date(to_date);
      end.setHours(23, 59, 59, 999);

      const totalQueries = await AnalyticsLog.count({
        where: { createdAt: { [Op.between]: [start, end] } }
      });
      const totalEscalations = await AnalyticsLog.count({
        where: { escalated: true, createdAt: { [Op.between]: [start, end] } }
      });
      const unansweredGaps = await AnalyticsLog.count({
        where: { found: false, createdAt: { [Op.between]: [start, end] } }
      });

      const accuracyRate = totalQueries > 0 ? (totalQueries - unansweredGaps) / totalQueries : 1.0;

      // Consultas más frecuentes
      const rawTop = await AnalyticsLog.findAll({
        attributes: [
          'query',
          [sequelize.fn('COUNT', sequelize.col('query')), 'count']
        ],
        where: { createdAt: { [Op.between]: [start, end] } },
        group: ['query'],
        order: [[sequelize.literal('count'), 'DESC']],
        limit: 5
      });
      const top_queries = rawTop.map(r => ({
        query: r.query,
        count: parseInt(r.getDataValue('count') || 0)
      }));

      // Brechas (no encontradas)
      const rawUnanswered = await AnalyticsLog.findAll({
        attributes: [
          'query',
          [sequelize.fn('COUNT', sequelize.col('query')), 'count'],
          'escalated'
        ],
        where: { found: false, createdAt: { [Op.between]: [start, end] } },
        group: ['query', 'escalated'],
        order: [[sequelize.literal('count'), 'DESC']],
        limit: 5
      });
      const unanswered_queries = rawUnanswered.map(r => ({
        query: r.query,
        count: parseInt(r.getDataValue('count') || 0),
        escalated: r.escalated
      }));

      return {
        data: {
          total_queries: totalQueries,
          total_escalations: totalEscalations,
          unanswered_gaps: unansweredGaps,
          accuracy_rate: accuracyRate
        },
        top_queries,
        unanswered_queries
      };
    }
  }
}

// --- CONEXIONES SSE MCP (Para Clientes Externos) ---
let activeTransports = [];

app.get('/sse', async (req, res) => {
  console.log('🔌 Nueva conexión SSE MCP iniciada');
  const transport = new SSEServerTransport('/message', res);
  activeTransports.push(transport);

  req.on('close', () => {
    console.log('🔌 Conexión SSE MCP cerrada');
    activeTransports = activeTransports.filter(t => t !== transport);
  });

  await mcpServer.connect(transport);
});

app.post('/message', async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = activeTransports.find(t => t.sessionId === sessionId) || activeTransports[activeTransports.length - 1];

  if (transport) {
    await transport.handleMessage(req, res);
  } else {
    res.status(400).send('No existe transporte SSE activo.');
  }
});

// --- REST API ENDPOINTS ---

// 1. Obtener lista de Empleados
app.get('/api/employees', async (req, res) => {
  try {
    const list = await Employee.findAll();
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Obtener historial de sesiones de un empleado
app.get('/api/employees/:employeeId/sessions', async (req, res) => {
  try {
    const list = await Session.findAll({
      where: { employeeId: req.params.employeeId },
      order: [['updatedAt', 'DESC']]
    });
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Obtener el historial de chat de una sesión
app.get('/api/sessions/:sessionId/history', async (req, res) => {
  try {
    const msgs = await Message.findAll({
      where: { sessionId: req.params.sessionId },
      order: [['createdAt', 'ASC']]
    });
    const formatted = msgs.map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: m.createdAt.toISOString(),
      source: m.source ? JSON.parse(m.source) : null,
      confidence: m.confidence,
      escalated: m.escalated,
      intent: m.intent
    }));
    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. API del Chat del Colaborador (Orquestador que usa las MCP tools locales)
import { detectLanguage } from './utils/languageDetect.js';
app.post('/api/chat', async (req, res) => {
  let { query, employeeId, sessionId, language } = req.body;
// Auto-detect language if not provided
if (!language) {
  language = detectLanguage(query);
  // Fallback heuristic: assume English if ASCII and contains common English words
  if (!language) {
    const asciiOnly = /^[\x00-\x7F]*$/.test(query);
    const englishWords = /\b(the|and|is|are|policy|telecommuting|benefits)\b/i.test(query);
    language = asciiOnly && englishWords ? 'en' : 'es';
  }
}
  if (!query || !employeeId || !sessionId) {
    return res.status(400).json({ error: 'Faltan parámetros: query, employeeId, sessionId' });
  }

  try {
    // Buscar o crear empleado
    let employee = await Employee.findByPk(employeeId);
    if (!employee) {
      employee = await Employee.create({
        id: employeeId,
        name: 'Colaborador Nuevo',
        email: `${employeeId.toLowerCase()}@garnier.com`,
        role: 'employee',
        startDate: new Date()
      });
    }

    // Buscar o crear sesión
    let session = await Session.findByPk(sessionId);
    if (!session) {
      session = await Session.create({ id: sessionId, employeeId });
    }

    // Guardar el mensaje del usuario
    await Message.create({
      sessionId,
      role: 'user',
      content: query
    });

    // 1. Clasificar Intención
    const classification = await callLocalTool('classify_query_intent', { query, employee_id: employeeId, session_id: sessionId, language });
    const { intent, escalate, reason } = classification;

    let assistantResponse = '';
    let responseSource = null;
    let responseConfidence = 0.0;
    let isEscalated = false;
    let extraData = {};

    if (escalate) {
      // Escalar inmediatamente
      const escalation = await callLocalTool('escalate_to_hr_agent', {
        employee_id: employeeId,
        employee_name: employee.name,
        query,
        reason,
        priority: intent === 'SENSITIVE' ? 'critical' : 'high',
        session_id: sessionId,
        language
      });
      assistantResponse = escalation.empathetic_message;
      isEscalated = true;
      extraData = { ticket_id: escalation.ticket_id, mail_preview_url: escalation.mail_preview_url };
    } else if (intent === 'ONBOARDING' && !employee.onboardingFlowId) {
      // Activar inducción si no tiene flujo activo
      const onboarding = await callLocalTool('start_onboarding_flow', {
        employee_id: employeeId,
        employee_name: employee.name,
        start_date: employee.startDate || new Date().toISOString(),
        language
      });
      assistantResponse = onboarding.welcome_message;
      extraData = { onboarding_flow_id: onboarding.flow_id, steps: onboarding.steps };
    } else {
      // Consulta normal RAG
      const search = await callLocalTool('search_policy_documents', {
        query,
        employee_id: employeeId,
        top_k: 3,
        language
      });

      if (search.found) {
        assistantResponse = search.answer;
        responseSource = search.source;
        responseConfidence = search.confidence;
      } else {
        // Brecha de información: Escalar como no_information
        const escalation = await callLocalTool('escalate_to_hr_agent', {
          employee_id: employeeId,
          employee_name: employee.name,
          query,
          reason: 'no_information',
          priority: 'low',
          session_id: sessionId,
          language
        });
        assistantResponse = escalation.empathetic_message;
        isEscalated = true;
        extraData = { ticket_id: escalation.ticket_id, mail_preview_url: escalation.mail_preview_url };
      }
    }

    // Guardar respuesta del asistente
    const assistantMsg = await Message.create({
      sessionId,
      role: 'assistant',
      content: assistantResponse,
      source: responseSource ? JSON.stringify(responseSource) : null,
      confidence: responseConfidence,
      escalated: isEscalated,
      intent
    });

    // If the original query was in English and the response is still marked as Spanish (has [EN] tag), translate it back to English
    if (language && language.toLowerCase() === 'en' && assistantResponse.trim().startsWith('[EN]')) {
      const translatedFinal = await translateText(assistantResponse, 'en');
      const cleanAnswer = translatedFinal.replace(/^\[EN\]\s*/i, '').trim();
      await assistantMsg.update({ content: cleanAnswer });
      assistantResponse = cleanAnswer;
    }

    // Actualizar el updatedAt de la sesión
    await session.changed('updatedAt', true);
    await session.save();

    res.json({
      message: {
        id: assistantMsg.id,
        role: 'assistant',
        content: assistantResponse,
        timestamp: assistantMsg.createdAt.toISOString(),
        source: responseSource,
        confidence: responseConfidence,
        escalated: isEscalated,
        intent
      },
      ...extraData
    });

  } catch (error) {
    console.error('Error en /api/chat:', error);
    res.status(500).json({ error: error.message });
  }
});

// 5. Cargar nuevo Documento PDF (REST Wrapper para admin)
app.post('/api/documents/upload', upload.single('file'), async (req, res) => {
  const { category, adminId, language = 'es' } = req.body;
  
  if (!req.file) {
    return res.status(400).json({ error: 'No se subió ningún archivo PDF.' });
  }

  try {
    const file_base64 = req.file.buffer.toString('base64');
    
    // Ejecutar lógica de la tool upload_policy_document
    const result = await callLocalTool('upload_policy_document', {
      file_name: req.file.originalname,
      file_base64,
      category,
      language,
      active: true,
      admin_id: adminId || 'ADM001'
    });

    res.json(result);
  } catch (error) {
    console.error('Error cargando documento:', error);
    res.status(500).json({ error: error.message });
  }
});

// 6. Obtener todos los documentos de políticas
app.get('/api/documents', async (req, res) => {
  try {
    const docs = await Document.findAll({
      order: [['createdAt', 'DESC']]
    });
    res.json(docs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 7. Modificar estado de un documento
app.post('/api/documents/:id/status', async (req, res) => {
  const { action, adminId, reason } = req.body;
  try {
    const result = await callLocalTool('manage_document_status', {
      document_id: req.params.id,
      action,
      admin_id: adminId || 'ADM001',
      reason
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 7.5. Traducir un documento a otro idioma y regenerar embeddings RAG
app.post('/api/documents/:id/translate', async (req, res) => {
  const { adminId } = req.body;
  const docId = req.params.id;
  try {
    const srcDoc = await Document.findByPk(docId);
    if (!srcDoc) {
      return res.status(404).json({ error: 'Documento no encontrado.' });
    }

    const targetLang = srcDoc.language === 'es' ? 'en' : 'es';
    
    // Traducir nombre de archivo y categoría
    const translatedFileNameRaw = await translateText(srcDoc.fileName, targetLang);
    const cleanFileName = translatedFileNameRaw.replace(/^\[(EN|ES)\]\s*/i, '');
    const prefix = targetLang === 'en' ? 'Translated' : 'Traducido';
    const finalFileName = `${prefix}_${cleanFileName}`;

    const translatedCategoryRaw = await translateText(srcDoc.category, targetLang);
    const finalCategory = translatedCategoryRaw.replace(/^\[(EN|ES)\]\s*/i, '');

    // Buscar todos los chunks
    const chunks = await DocumentChunk.findAll({ where: { documentId: srcDoc.id } });

    // Crear el nuevo documento traducido
    const newDoc = await Document.create({
      fileName: finalFileName,
      category: finalCategory,
      language: targetLang,
      active: true,
      uploadedBy: adminId || 'ADM001',
      chunksCreated: chunks.length
    });

    const chunkRecords = [];
    for (const ch of chunks) {
      const translatedContent = await translateText(ch.content, targetLang);
      const translatedSection = await translateText(ch.section || '', targetLang);
      
      const cleanContent = translatedContent.replace(/^\[(EN|ES)\]\s*/i, '');
      const cleanSection = translatedSection.replace(/^\[(EN|ES)\]\s*/i, '');

      // Generar nuevo embedding para el contenido traducido en su respectivo idioma
      const textToEmbed = `${cleanSection} ${cleanContent}`;
      const embedding = await getEmbedding(textToEmbed);

      chunkRecords.push({
        documentId: newDoc.id,
        content: cleanContent,
        section: cleanSection,
        page: ch.page,
        embedding: JSON.stringify(embedding)
      });
    }

    await DocumentChunk.bulkCreate(chunkRecords);

    res.json({ success: true, document: newDoc });
  } catch (error) {
    console.error('Error traduciendo documento:', error);
    res.status(500).json({ error: error.message });
  }
});

// 8. Listar tickets de escalamiento de RRHH
app.get('/api/tickets', async (req, res) => {
  try {
    const tickets = await Ticket.findAll({
      order: [['createdAt', 'DESC']]
    });
    res.json(tickets);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 9. Resolver un ticket
app.post('/api/tickets/:id/resolve', async (req, res) => {
  try {
    const ticket = await Ticket.findByPk(req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket no encontrado.' });
    }
    await ticket.update({ status: 'resolved' });
    res.json({ success: true, status: 'resolved' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 10. Consultar Analíticas de RRHH
app.get('/api/analytics', async (req, res) => {
  const { reportType, fromDate, toDate } = req.query;
  
  if (!reportType || !fromDate || !toDate) {
    return res.status(400).json({ error: 'Faltan parámetros: reportType, fromDate, toDate' });
  }

  try {
    const result = await callLocalTool('get_hr_analytics', {
      report_type: reportType,
      from_date: fromDate,
      to_date: toDate
    });
    
    if (reportType === 'full_summary') {
      res.json({ data: result.data });
    } else if (reportType === 'top_queries') {
      res.json({ data: result.top_queries });
    } else if (reportType === 'unanswered_queries') {
      res.json({ data: result.unanswered_queries });
    } else {
      res.json(result);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 11. Recursos estáticos
app.get('/api/contacts', async (req, res) => {
  const contacts = [
    { name: 'Diana Garnier', role: 'Directora de Desarrollo Humano', email: 'diana.garnier@garnier.com', specialty: 'General, Casos Sensibles y Compensaciones' },
    { name: 'Manuel Quirós', role: 'Generalista de RRHH', email: 'manuel.quiros@garnier.com', specialty: 'Salud Ocupacional, Licencias y Permisos' },
    { name: 'Andrea Monge', role: 'Encargada de Onboarding', email: 'andrea.monge@garnier.com', specialty: 'Inducción, Capacitaciones y Onboarding' }
  ];
  res.json(contacts);
});

app.get('/api/sensitive-topics', async (req, res) => {
  const topics = ['depresión', 'ansiedad', 'acoso', 'suicidio', 'duelo', 'violencia', 'burnout', 'maltrato', 'hostigamiento'];
  res.json(topics);
});

// --- INICIO DE SERVIDOR ---
const PORT = process.env.PORT || 5002;

async function startServer() {
  // Inicializar Base de Datos MySQL (sincronizar y sembrar)
  await initializeDatabase();

  app.listen(PORT, () => {
    console.log(`🚀 Servidor Express ejecutándose en http://localhost:${PORT}`);
    console.log(`🔌 Endpoint SSE MCP activo en http://localhost:${PORT}/sse`);
  });
}

startServer();
