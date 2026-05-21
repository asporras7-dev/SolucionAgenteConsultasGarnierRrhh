import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, Bot, User, Sparkles, FileText, CheckCircle2, 
  AlertTriangle, Clock, Plus, MessageSquare, AlertCircle, Bookmark 
} from 'lucide-react';

const t = {
  es: {
    newChat: 'Nueva Conversación',
    sessions: 'Tus Sesiones',
    noSessions: 'No hay chats previos',
    sessionPrefix: 'Sesión',
    activeTitle: 'Agente RRHH Garnier',
    subtitle: 'Consultas de Políticas y Reglamentos Oficiales',
    activeUser: 'Activo',
    hello: '¡Hola, {name}!',
    welcomeText: 'Soy el Agente Inteligente de Recursos Humanos de Garnier & Garnier. Puedo responder tus dudas sobre vacaciones, teletrabajo, código de conducta y más.',
    quickLabel: 'Preguntas Sugeridas',
    errorConnection: '⚠️ Error de conexión con el Agente de RRHH: ',
    errorSend: '⚠️ Ocurrió un error al enviar el mensaje. Asegúrese de que el backend esté ejecutándose.',
    onboardingTitle: 'Tu Inducción Guiada',
    progress: 'Progreso',
    completed: 'completado',
    consulting: 'Consultando documentos oficiales...',
    inputPlaceholder: 'Escribe tu consulta sobre políticas o reglamentos...',
    close: 'Cerrar',
    sourceDetails: 'Detalles de la Fuente',
    document: 'Documento',
    section: 'Sección / Capítulo',
    approxPage: 'Página aproximada',
    ragConfidence: 'Confianza del RAG',
    vectorContent: 'Contenido Vectorizado',
    ticketGenerated: 'Escalamiento a RRHH Generado',
    ticketSub: 'Tu consulta ha sido derivada al especialista. Se ha abierto el caso con alta prioridad.',
    ticketLabel: 'Ticket',
    responseLabel: 'Respuesta: 24h o menos',
    sourceBtn: 'Fuente',
    confidenceLabel: 'Confianza',
  },
  en: {
    newChat: 'New Conversation',
    sessions: 'Your Sessions',
    noSessions: 'No previous chats',
    sessionPrefix: 'Session',
    activeTitle: 'Garnier HR Agent',
    subtitle: 'Inquiries about Official Policies and Regulations',
    activeUser: 'Active',
    hello: 'Hello, {name}!',
    welcomeText: 'I am the Garnier & Garnier Intelligent Human Resources Agent. I can answer your questions about vacation, telecommuting (WFH), code of conduct, and more.',
    quickLabel: 'Suggested Questions',
    errorConnection: '⚠️ Connection error with HR Agent: ',
    errorSend: '⚠️ An error occurred while sending the message. Make sure the backend is running.',
    onboardingTitle: 'Your Guided Induction',
    progress: 'Progress',
    completed: 'completed',
    consulting: 'Consulting official documents...',
    inputPlaceholder: 'Write your inquiry about policies or regulations...',
    close: 'Close',
    sourceDetails: 'Source Details',
    document: 'Document',
    section: 'Section / Chapter',
    approxPage: 'Approximate page',
    ragConfidence: 'RAG Confidence',
    vectorContent: 'Vectorized Content',
    ticketGenerated: 'HR Escalation Ticket Generated',
    ticketSub: 'Your inquiry has been forwarded to the specialist. A high-priority case has been opened.',
    ticketLabel: 'Ticket',
    responseLabel: 'Response: 24h or less',
    sourceBtn: 'Source',
    confidenceLabel: 'Confidence',
  }
};

const quickQuestions = {
  es: [
    { text: '¿Cuántos días de vacaciones tengo?', label: 'Vacaciones' },
    { text: '¿Cuáles son las políticas de teletrabajo?', label: 'Teletrabajo' },
    { text: 'Últimamente me siento muy deprimido y con mucho burnout', label: 'Caso Sensible' },
    { text: 'Quiero comenzar mi flujo de inducción', label: 'Inducción (Luis)' }
  ],
  en: [
    { text: 'How many vacation days do I have?', label: 'Vacation' },
    { text: 'What are the telecommuting policies?', label: 'Telecommuting' },
    { text: 'Lately I feel very depressed and with a lot of burnout', label: 'Sensitive Case' },
    { text: 'I want to start my onboarding flow', label: 'Onboarding (Luis)' }
  ]
};

export default function ChatInterface({ activeEmployee, activeSession, setActiveSession }) {
  const [language, setLanguage] = useState('es');
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [onboarding, setOnboarding] = useState(null);
  const [selectedSource, setSelectedSource] = useState(null);
  
  const chatEndRef = useRef(null);

  // Cargar lista de sesiones del empleado
  const fetchSessions = async () => {
    try {
      const response = await fetch(`http://localhost:5000/api/employees/${activeEmployee.id}/sessions`);
      if (response.ok) {
        const data = await response.json();
        setSessions(data);
        // Si no hay sesión activa, seleccionar la última o crear una
        if (data.length > 0 && !activeSession) {
          setActiveSession(data[0].id);
        }
      }
    } catch (error) {
      console.error('Error fetching sessions:', error);
    }
  };

  // Cargar historial de la sesión activa
  const fetchHistory = async () => {
    if (!activeSession) return;
    try {
      const response = await fetch(`http://localhost:5000/api/sessions/${activeSession}/history`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data);
        
        // Verificar si la sesión tiene algún mensaje de onboarding para cargar el flujo
        const onboardingMsg = data.find(m => m.intent === 'ONBOARDING');
        if (onboardingMsg || activeEmployee.onboardingFlowId) {
          fetchOnboardingDetails();
        } else {
          setOnboarding(null);
        }
      }
    } catch (error) {
      console.error('Error fetching chat history:', error);
    }
  };

  // Cargar detalles de onboarding (checklist)
  const fetchOnboardingDetails = async () => {
    try {
      // Simular obtención de checklist desde el recurso
      const response = await fetch('http://localhost:5000/api/contacts'); // solo para verificar api viva
      if (response.ok) {
        setOnboarding({
          flow_id: activeEmployee.onboardingFlowId || 'ONB' + Math.floor(100000 + Math.random() * 900000),
          steps: language === 'en' ? [
            { step_number: 1, title: 'Welcome and Induction', description: 'Initial meeting and office tour.', source: 'Induction Manual, Section 1', completed: true },
            { step_number: 2, title: 'Policy Reading and Code of Ethics', description: 'Sign confirmation of reading.', source: 'Code of Ethical Conduct', completed: false },
            { step_number: 3, title: 'Submission of Legal Documents', description: 'Submission of IBAN account and CCSS registration.', source: 'Hiring Policies', completed: false },
            { step_number: 4, title: 'Tools Setup', description: 'Email credentials and system access.', source: 'IT Guide', completed: false },
            { step_number: 5, title: 'Feedback Meeting', description: 'Q&A session with your direct lead.', source: 'Induction Manual, Section 4', completed: false }
          ] : [
            { step_number: 1, title: 'Bienvenida e Inducción', description: 'Reunión inicial y recorrido por la oficina.', source: 'Manual de Inducción, Sección 1', completed: true },
            { step_number: 2, title: 'Lectura del Código de Ética', description: 'Firmar confirmación de lectura.', source: 'Código de Conducta Ética', completed: false },
            { step_number: 3, title: 'Entrega de Documentos Legales', description: 'Presentación de cuenta IBAN y registro CCSS.', source: 'Políticas de Contratación', completed: false },
            { step_number: 4, title: 'Herramientas de Trabajo', description: 'Credenciales de correo y accesos.', source: 'Guía de TI', completed: false },
            { step_number: 5, title: 'Reunión de Feedback', description: 'Espacio de preguntas con el líder directo.', source: 'Manual de Inducción, Sección 4', completed: false }
          ]
        });
      }
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, [activeEmployee]);

  useEffect(() => {
    fetchHistory();
  }, [activeSession]);

  useEffect(() => {
    if (onboarding || activeEmployee.onboardingFlowId) {
      fetchOnboardingDetails();
    }
  }, [language, activeEmployee]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Crear una nueva sesión de chat
  const handleNewSession = async () => {
    const newSessionId = 'SES' + Math.floor(100000 + Math.random() * 900000);
    try {
      setActiveSession(newSessionId);
      setMessages([]);
      setOnboarding(null);
      setSessions(prev => [{ id: newSessionId, employeeId: activeEmployee.id, createdAt: new Date() }, ...prev]);
    } catch (error) {
      console.error(error);
    }
  };

  // Enviar mensaje al backend
  const handleSend = async (textToSend = query) => {
    if (!textToSend.trim() || loading) return;

    const currentSessionId = activeSession || 'SES' + Math.floor(100000 + Math.random() * 900000);
    if (!activeSession) {
      setActiveSession(currentSessionId);
    }

    const userMsg = {
      role: 'user',
      content: textToSend,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMsg]);
    setQuery('');
    setLoading(true);

    try {
      const response = await fetch('http://localhost:5000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: textToSend,
          employeeId: activeEmployee.id,
          sessionId: currentSessionId,
          language: language // Enviar idioma seleccionado al backend
        })
      });

      if (response.ok) {
        const data = await response.json();
        
        // Agregar respuesta del bot
        setMessages(prev => [...prev, data.message]);

        // Si activó onboarding
        if (data.onboarding_flow_id) {
          setOnboarding({
            flow_id: data.onboarding_flow_id,
            steps: data.steps.map((s, i) => ({ ...s, completed: i === 0 }))
          });
        }
        
        // Refrescar lista de sesiones
        fetchSessions();
      } else {
        const err = await response.json();
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `${t[language].errorConnection}${err.error || 'Try again.'}`,
          timestamp: new Date().toISOString()
        }]);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: t[language].errorSend,
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setLoading(false);
    }
  };

  // Completar un paso de onboarding (Front-only demo)
  const toggleOnboardingStep = (index) => {
    if (!onboarding) return;
    const updatedSteps = [...onboarding.steps];
    updatedSteps[index].completed = !updatedSteps[index].completed;
    setOnboarding({ ...onboarding, steps: updatedSteps });
  };

  const completedSteps = onboarding ? onboarding.steps.filter(s => s.completed).length : 0;
  const progressPercent = onboarding ? Math.round((completedSteps / onboarding.steps.length) * 100) : 0;

  return (
    <div className="flex flex-1 h-[calc(100vh-140px)] gap-6 overflow-hidden animate-fade-in-up">
      {/* Barra Lateral Izquierda: Historial de Sesiones */}
      <div className="w-64 flex flex-col glass-panel rounded-2xl p-4 overflow-hidden">
        <button 
          onClick={handleNewSession}
          className="flex items-center justify-center gap-2 w-full py-3 bg-brand-green-mid hover:bg-brand-green-light active:bg-brand-green-dark text-white font-medium rounded-xl transition duration-200 cursor-pointer shadow-md mb-4"
        >
          <Plus size={18} />
          {t[language].newChat}
        </button>

        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 px-1">{t[language].sessions}</h3>
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {sessions.length === 0 ? (
            <div className="text-sm text-slate-500 text-center py-6">{t[language].noSessions}</div>
          ) : (
            sessions.map(s => (
              <button
                key={s.id}
                onClick={() => setActiveSession(s.id)}
                className={`flex items-center gap-3 w-full p-3 rounded-xl text-left transition duration-150 cursor-pointer ${
                  activeSession === s.id 
                    ? 'bg-brand-green-mid/20 border border-brand-green-accent/40 text-brand-green-accent' 
                    : 'bg-slate-800/40 hover:bg-slate-800/80 text-slate-300 border border-transparent'
                }`}
              >
                <MessageSquare size={16} className={activeSession === s.id ? 'text-brand-green-accent' : 'text-slate-400'} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{t[language].sessionPrefix} {s.id.replace('SES', '#')}</div>
                  <div className="text-xs text-slate-500">{new Date(s.createdAt || s.updatedAt).toLocaleDateString(language === 'en' ? 'en-US' : 'es-CR')}</div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Panel Central: Chat de Conversación */}
      <div className="flex-1 flex flex-col glass-panel rounded-2xl overflow-hidden relative">
        {/* Cabecera del Chat */}
        <div className="px-6 py-4 border-b border-brand-slate-border flex items-center justify-between bg-slate-900/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-green-mid/20 border border-brand-green-accent/30 flex items-center justify-center text-brand-green-accent">
              <Bot size={22} />
            </div>
            <div>
              <h2 className="text-md font-bold text-slate-100 flex items-center gap-2">
                {t[language].activeTitle}
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              </h2>
              <p className="text-xs text-slate-400">{t[language].subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Selector de idioma con efecto glassmorphism */}
            <div className="flex bg-slate-850 p-0.5 rounded-lg border border-brand-slate-border">
              <button
                onClick={() => setLanguage('es')}
                className={`text-[10px] font-bold px-2 py-1 rounded transition duration-200 cursor-pointer ${
                  language === 'es'
                    ? 'bg-brand-green-mid text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                ES
              </button>
              <button
                onClick={() => setLanguage('en')}
                className={`text-[10px] font-bold px-2 py-1 rounded transition duration-200 cursor-pointer ${
                  language === 'en'
                    ? 'bg-brand-green-mid text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                EN
              </button>
            </div>
            <div className="text-xs px-3 py-1 bg-slate-800 rounded-full text-slate-400 border border-brand-slate-border">
              {t[language].activeUser}: {activeEmployee.name}
            </div>
          </div>
        </div>

        {/* Mensajes */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center h-full text-center max-w-lg mx-auto space-y-6">
              <div className="w-16 h-16 rounded-3xl bg-brand-green-mid/10 border border-brand-green-accent/20 flex items-center justify-center text-brand-green-accent">
                <Sparkles size={32} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-200">{t[language].hello.replace('{name}', activeEmployee.name)}</h3>
                <p className="text-sm text-slate-400 mt-2">
                  {t[language].welcomeText}
                </p>
              </div>

              {/* Botones de sugerencia */}
              <div className="grid grid-cols-2 gap-3 w-full">
                {quickQuestions[language].map((q, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(q.text)}
                    className="p-3 bg-slate-800/40 hover:bg-brand-green-mid/10 hover:border-brand-green-accent/40 border border-brand-slate-border text-left rounded-xl transition duration-150 text-xs text-slate-300 cursor-pointer"
                  >
                    <span className="font-semibold text-brand-green-accent block mb-1">{q.label}</span>
                    {q.text.length > 45 ? q.text.substring(0, 45) + '...' : q.text}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((m, idx) => {
                const isUser = m.role === 'user';
                return (
                  <div 
                    key={m.id || idx} 
                    className={`flex gap-3 max-w-[80%] ${isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
                  >
                    {/* Avatar */}
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      isUser ? 'bg-slate-700 text-slate-200' : 'bg-brand-green-mid text-white'
                    }`}>
                      {isUser ? <User size={16} /> : <Bot size={16} />}
                    </div>

                    {/* Burbuja */}
                    <div className="space-y-2">
                      <div className={`p-4 rounded-2xl ${
                        isUser 
                          ? 'bg-slate-800 text-slate-200 rounded-tr-none' 
                          : 'bg-brand-slate-card border border-brand-slate-border text-slate-100 rounded-tl-none'
                      }`}>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</p>

                        {/* Banner de Escalamiento Empático */}
                        {m.escalated && (
                          <div className="mt-4 p-3 bg-gradient-to-r from-amber-950/40 to-rose-950/40 border border-rose-500/20 rounded-xl flex items-start gap-3">
                            <AlertCircle className="text-rose-400 shrink-0 mt-0.5" size={18} />
                            <div className="text-xs space-y-1">
                              <span className="font-semibold text-rose-300">{t[language].ticketGenerated}</span>
                              <p className="text-slate-400">
                                {t[language].ticketSub}
                              </p>
                              <div className="flex gap-4 mt-2 font-mono text-[10px] text-slate-400">
                                <span>{t[language].ticketLabel}: {m.intent === 'NO_INFO' ? 'TKT_GAP' : 'TKT_URGENTE'}</span>
                                <span className="flex items-center gap-1"><Clock size={10} /> {t[language].responseLabel}</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Metadatos (Citas y Confianza) */}
                      {!isUser && m.source && (
                        <div className="flex flex-wrap gap-2 items-center px-1">
                          <button
                            onClick={() => setSelectedSource(m.source)}
                            className="flex items-center gap-1.5 text-[11px] bg-brand-green-mid/10 border border-brand-green-mid/30 text-brand-green-accent py-1 px-2.5 rounded-full hover:bg-brand-green-mid/20 transition cursor-pointer"
                          >
                            <Bookmark size={10} />
                            <span>{t[language].sourceBtn}: {m.source.document_name} ({m.source.section})</span>
                          </button>
                          
                          {m.confidence > 0 && (
                            <span className="text-[10px] text-slate-500">
                              {t[language].confidenceLabel}: {Math.round(m.confidence * 100)}%
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {loading && (
                <div className="flex gap-3 max-w-[80%] mr-auto">
                  <div className="w-8 h-8 rounded-lg bg-brand-green-mid text-white flex items-center justify-center shrink-0">
                    <Bot size={16} />
                  </div>
                  <div className="bg-brand-slate-card border border-brand-slate-border text-slate-100 p-4 rounded-2xl rounded-tl-none flex items-center gap-3">
                    <div className="flex space-x-1">
                      <div className="h-2 w-2 bg-brand-green-accent rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="h-2 w-2 bg-brand-green-accent rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="h-2 w-2 bg-brand-green-accent rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                    <span className="text-xs text-slate-400">{t[language].consulting}</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        {/* Input de Mensajes */}
        <div className="p-4 border-t border-brand-slate-border bg-slate-900/20">
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder={t[language].inputPlaceholder}
              className="flex-1 bg-slate-800/80 border border-brand-slate-border focus:border-brand-green-accent focus:outline-none rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-500 transition duration-150"
            />
            <button
              onClick={() => handleSend()}
              disabled={!query.trim() || loading}
              className="p-3 bg-brand-green-mid hover:bg-brand-green-light disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-xl transition duration-150 cursor-pointer shadow-md flex items-center justify-center shrink-0"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Panel Lateral Derecho: Guía de Onboarding (Si está activo) */}
      {onboarding && (
        <div className="w-80 glass-panel rounded-2xl p-4 overflow-hidden flex flex-col shrink-0 animate-fade-in-up">
          <div className="flex items-center gap-2 border-b border-brand-slate-border pb-3 mb-4">
            <Sparkles size={18} className="text-brand-green-accent" />
            <h3 className="font-bold text-slate-200 text-sm">{t[language].onboardingTitle}</h3>
          </div>

          <div className="bg-slate-800/40 rounded-xl p-3 border border-brand-slate-border mb-4">
            <div className="flex justify-between text-xs font-semibold text-slate-300 mb-2">
              <span>{t[language].progress}</span>
              <span className="text-brand-green-accent">{progressPercent}% {t[language].completed}</span>
            </div>
            <div className="w-full bg-slate-700 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-brand-green-accent h-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {onboarding.steps.map((step, idx) => (
              <div 
                key={step.step_number} 
                className={`p-3 rounded-xl border transition-all duration-150 text-left cursor-pointer ${
                  step.completed 
                    ? 'bg-brand-green-mid/10 border-brand-green-accent/30 text-slate-300' 
                    : 'bg-slate-800/30 border-brand-slate-border hover:border-slate-600 text-slate-400'
                }`}
                onClick={() => toggleOnboardingStep(idx)}
              >
                <div className="flex items-start gap-2.5">
                  <button className="shrink-0 mt-0.5">
                    {step.completed ? (
                      <CheckCircle2 size={16} className="text-brand-green-accent" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-slate-500 hover:border-brand-green-accent transition"></div>
                    )}
                  </button>
                  <div className="text-xs space-y-1">
                    <span className={`font-semibold block ${step.completed ? 'text-slate-200 line-through' : 'text-slate-300'}`}>
                      {step.step_number}. {step.title}
                    </span>
                    <p className="text-[11px] text-slate-500 leading-normal">{step.description}</p>
                    <span className="text-[9px] bg-slate-800/80 px-2 py-0.5 rounded text-slate-400 font-mono inline-block mt-1">
                      {step.source}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal de Detalle de Cita */}
      {selectedSource && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-brand-slate-card border border-brand-slate-border rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-brand-slate-border bg-slate-900/60 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <FileText className="text-brand-green-accent" size={20} />
                <h3 className="font-bold text-slate-200 text-sm">{t[language].sourceDetails}</h3>
              </div>
              <button 
                onClick={() => setSelectedSource(null)}
                className="text-slate-400 hover:text-slate-200 font-semibold cursor-pointer"
              >
                {t[language].close}
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-xs font-semibold text-slate-400">
                <div>
                  <span className="text-slate-500 block">{t[language].document}</span>
                  <span className="text-slate-200">{selectedSource.document_name}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">{t[language].section}</span>
                  <span className="text-slate-200">{selectedSource.section}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">{t[language].approxPage}</span>
                  <span className="text-slate-200">Pág. {selectedSource.page}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">{t[language].ragConfidence}</span>
                  <span className="text-brand-green-accent">Alta (94%)</span>
                </div>
              </div>
              
              <div className="bg-slate-900/60 p-4 border border-brand-slate-border rounded-xl">
                <span className="text-xs text-slate-500 font-bold block mb-1">{t[language].vectorContent}</span>
                <p className="text-xs text-slate-300 leading-relaxed italic">
                  "...el colaborador tendrá derecho a la consulta de políticas del manual y escalamiento automático por parte del asistente de RRHH en caso de no encontrarse información o ser un tema de urgencia emocional..."
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
