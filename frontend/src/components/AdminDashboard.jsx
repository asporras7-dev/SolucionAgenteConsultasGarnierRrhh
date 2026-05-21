import React, { useState, useEffect } from 'react';
import { 
  FileText, Upload, Check, AlertCircle, BarChart2, ShieldAlert, 
  Trash2, Mail, CheckCircle2, ChevronRight, User, Clock, AlertTriangle, HelpCircle
} from 'lucide-react';

export default function AdminDashboard({ activeEmployee }) {
  const [activeTab, setActiveTab] = useState('documents'); // 'documents', 'tickets', 'analytics'
  const [documents, setDocuments] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [selectedTicketSession, setSelectedTicketSession] = useState(null);
  const [ticketHistory, setTicketHistory] = useState([]);
  const [uploadCategory, setUploadCategory] = useState('politica_interna');
  const [uploadLanguage, setUploadLanguage] = useState('es'); // Idioma de subida (es/en)
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  
  // Analíticas
  const [analytics, setAnalytics] = useState(null);
  const [topQueries, setTopQueries] = useState([]);
  const [unanswered, setUnanswered] = useState([]);

  // Rango de fechas por defecto (último mes)
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [toDate, setToDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  const fetchDocuments = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/documents');
      if (response.ok) {
        const data = await response.json();
        setDocuments(data);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const fetchTickets = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/tickets');
      if (response.ok) {
        const data = await response.json();
        setTickets(data);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const fetchAnalytics = async () => {
    try {
      // Resumen general
      const r1 = await fetch(`http://localhost:5000/api/analytics?reportType=full_summary&fromDate=${fromDate}&toDate=${toDate}`);
      if (r1.ok) {
        const d1 = await r1.json();
        setAnalytics(d1.data);
      }

      // Top queries
      const r2 = await fetch(`http://localhost:5000/api/analytics?reportType=top_queries&fromDate=${fromDate}&toDate=${toDate}`);
      if (r2.ok) {
        const d2 = await r2.json();
        setTopQueries(d2.data);
      }

      // Brechas
      const r3 = await fetch(`http://localhost:5000/api/analytics?reportType=unanswered_queries&fromDate=${fromDate}&toDate=${toDate}`);
      if (r3.ok) {
        const d3 = await r3.json();
        setUnanswered(d3.data);
      }
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    fetchDocuments();
    fetchTickets();
    fetchAnalytics();
  }, [fromDate, toDate]);

  // Cargar historial de ticket para ver contexto
  const viewTicketContext = async (ticket) => {
    setSelectedTicketSession(ticket);
    try {
      const response = await fetch(`http://localhost:5000/api/sessions/${ticket.sessionId}/history`);
      if (response.ok) {
        const data = await response.json();
        setTicketHistory(data);
      }
    } catch (error) {
      console.error(error);
    }
  };

  // Cambiar estado de activación del documento
  const toggleDocStatus = async (docId, isActive) => {
    const action = isActive ? 'deactivate' : 'activate';
    try {
      const response = await fetch(`http://localhost:5000/api/documents/${docId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          adminId: activeEmployee.id
        })
      });
      if (response.ok) {
        fetchDocuments();
      }
    } catch (error) {
      console.error(error);
    }
  };

  // Traducir documento a idioma opuesto
  const translateDocument = async (docId) => {
    setUploading(true);
    setUploadMsg('Traduciendo documento y regenerando embeddings RAG en base de datos MySQL...');
    try {
      const response = await fetch(`http://localhost:5000/api/documents/${docId}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminId: activeEmployee.id
        })
      });
      if (response.ok) {
        const data = await response.json();
        setUploadMsg(`✅ ¡Éxito! Documento traducido con éxito: "${data.document.fileName}"`);
        fetchDocuments();
        fetchAnalytics();
      } else {
        const err = await response.json();
        setUploadMsg(`⚠️ Error traduciendo: ${err.error || 'No se pudo traducir.'}`);
      }
    } catch (error) {
      console.error(error);
      setUploadMsg('⚠️ Error de conexión con el servidor de traducción.');
    } finally {
      setUploading(false);
    }
  };

  // Resolver ticket
  const resolveTicket = async (ticketId) => {
    try {
      const response = await fetch(`http://localhost:5000/api/tickets/${ticketId}/resolve`, {
        method: 'POST'
      });
      if (response.ok) {
        fetchTickets();
        if (selectedTicketSession && selectedTicketSession.id === ticketId) {
          setSelectedTicketSession(null);
        }
      }
    } catch (error) {
      console.error(error);
    }
  };

  // Manejar subida de archivo PDF
  const handleFileChange = (e) => {
    setSelectedFile(e.target.files[0]);
    setUploadMsg('');
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      setUploadMsg('Por favor seleccione un archivo PDF.');
      return;
    }

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('category', uploadCategory);
    formData.append('adminId', activeEmployee.id);
    formData.append('language', uploadLanguage); // Agregar idioma de subida

    setUploading(true);
    setUploadMsg('Procesando, segmentando y vectorizando PDF en la base de datos MySQL...');

    try {
      const response = await fetch('http://localhost:5000/api/documents/upload', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        setUploadMsg(`✅ ¡Éxito! Documento cargado y fragmentado en ${data.chunks_created} partes.`);
        setSelectedFile(null);
        fetchDocuments();
        fetchAnalytics();
      } else {
        const err = await response.json();
        setUploadMsg(`⚠️ Error: ${err.error || 'No se pudo subir.'}`);
      }
    } catch (error) {
      console.error(error);
      setUploadMsg('⚠️ Error de conexión con el backend.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-1 h-[calc(100vh-140px)] gap-6 overflow-hidden animate-fade-in-up">
      {/* Sidebar de navegación interna de Admin */}
      <div className="w-56 flex flex-col glass-panel rounded-2xl p-4 shrink-0">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4 px-1">Administración</h3>
        <nav className="space-y-2">
          <button
            onClick={() => setActiveTab('documents')}
            className={`flex items-center gap-3 w-full p-3 rounded-xl text-left text-sm font-medium transition cursor-pointer ${
              activeTab === 'documents' 
                ? 'bg-brand-green-mid/20 border border-brand-green-accent/40 text-brand-green-accent' 
                : 'hover:bg-slate-800/60 text-slate-300'
            }`}
          >
            <FileText size={16} />
            Gestión Documental
          </button>
          <button
            onClick={() => setActiveTab('tickets')}
            className={`flex items-center gap-3 w-full p-3 rounded-xl text-left text-sm font-medium transition cursor-pointer relative ${
              activeTab === 'tickets' 
                ? 'bg-brand-green-mid/20 border border-brand-green-accent/40 text-brand-green-accent' 
                : 'hover:bg-slate-800/60 text-slate-300'
            }`}
          >
            <ShieldAlert size={16} />
            Tickets de Escalamiento
            {tickets.filter(t => t.status === 'open').length > 0 && (
              <span className="absolute right-3 top-3 h-5 w-5 bg-rose-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold">
                {tickets.filter(t => t.status === 'open').length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`flex items-center gap-3 w-full p-3 rounded-xl text-left text-sm font-medium transition cursor-pointer ${
              activeTab === 'analytics' 
                ? 'bg-brand-green-mid/20 border border-brand-green-accent/40 text-brand-green-accent' 
                : 'hover:bg-slate-800/60 text-slate-300'
            }`}
          >
            <BarChart2 size={16} />
            Estadísticas y Gaps
          </button>
        </nav>
      </div>

      {/* Área de Contenido Principal */}
      <div className="flex-1 glass-panel rounded-2xl p-6 overflow-hidden flex flex-col">
        {/* Pestaña 1: Gestión de Documentos */}
        {activeTab === 'documents' && (
          <div className="flex-1 flex gap-6 overflow-hidden">
            {/* Formulario de carga */}
            <div className="w-80 border-r border-brand-slate-border pr-6 flex flex-col justify-between overflow-y-auto">
              <div>
                <h2 className="text-md font-bold text-slate-200 mb-2 flex items-center gap-2">
                  <Upload size={18} className="text-brand-green-accent" />
                  Cargar Documento PDF
                </h2>
                <p className="text-xs text-slate-400 mb-4">
                  Carga documentos de políticas o reglamentos legales para alimentar el motor de búsqueda semántica RAG del agente.
                </p>

                <form onSubmit={handleUpload} className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-400 block mb-1">Categoría</label>
                    <select
                      value={uploadCategory}
                      onChange={(e) => setUploadCategory(e.target.value)}
                      className="w-full bg-slate-800 border border-brand-slate-border focus:border-brand-green-accent focus:outline-none rounded-xl px-3 py-2 text-xs text-slate-200 cursor-pointer"
                    >
                      <option value="politica_interna">Categoría A — Política Interna Garnier</option>
                      <option value="codigo_conducta">Categoría A — Código de Conducta Ética</option>
                      <option value="manual_induccion">Categoría A — Manual de Inducción Colaboradores</option>
                      <option value="normativa_legal">Categoría B — Código de Trabajo CR</option>
                      <option value="reglamento_salud">Categoría B — Reglamento de Salud CCSS/INS</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-400 block mb-1">Idioma del Documento</label>
                    <select
                      value={uploadLanguage}
                      onChange={(e) => setUploadLanguage(e.target.value)}
                      className="w-full bg-slate-800 border border-brand-slate-border focus:border-brand-green-accent focus:outline-none rounded-xl px-3 py-2 text-xs text-slate-200 cursor-pointer"
                    >
                      <option value="es">🇪🇸 Español (ES)</option>
                      <option value="en">🇺🇸 Inglés (EN)</option>
                    </select>
                  </div>

                  <div className="border-2 border-dashed border-slate-700 hover:border-slate-500 rounded-2xl p-6 text-center transition cursor-pointer relative">
                    <input 
                      type="file" 
                      accept=".pdf"
                      onChange={handleFileChange}
                      className="absolute inset-0 opacity-0 cursor-pointer" 
                    />
                    <FileText className="mx-auto text-slate-500 mb-2" size={32} />
                    <span className="text-xs text-slate-300 block font-medium">
                      {selectedFile ? selectedFile.name : 'Arrastra o selecciona PDF'}
                    </span>
                    <span className="text-[10px] text-slate-500 block mt-1">Máx. 50MB</span>
                  </div>

                  <button
                    type="submit"
                    disabled={!selectedFile || uploading}
                    className="w-full py-3 bg-brand-green-mid hover:bg-brand-green-light disabled:bg-slate-800 disabled:text-slate-600 text-white font-medium text-xs rounded-xl transition duration-200 shadow-md cursor-pointer flex items-center justify-center gap-2"
                  >
                    {uploading ? 'Procesando...' : 'Procesar y Vectorizar'}
                  </button>
                </form>
              </div>

              {uploadMsg && (
                <div className={`mt-4 p-3 rounded-xl border text-xs leading-normal ${
                  uploadMsg.startsWith('✅') 
                    ? 'bg-brand-green-mid/10 border-brand-green-accent/30 text-brand-green-accent' 
                    : 'bg-slate-800 border-slate-700 text-slate-300'
                }`}>
                  {uploadMsg}
                </div>
              )}
            </div>

            {/* Listado de documentos cargados */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <h2 className="text-md font-bold text-slate-200 mb-4">Políticas en el Sistema ({documents.length})</h2>
              
              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {documents.length === 0 ? (
                  <div className="text-center py-16 text-slate-500 text-sm">
                    No hay documentos cargados en la base de datos.
                  </div>
                ) : (
                  documents.map(doc => (
                    <div 
                      key={doc.id}
                      className="p-4 bg-slate-800/30 border border-brand-slate-border rounded-xl flex items-center justify-between hover:bg-slate-800/50 transition"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-brand-green-mid/10 border border-brand-green-mid/30 flex items-center justify-center text-brand-green-accent">
                          <FileText size={20} />
                        </div>
                        <div>
                          <span className="font-semibold text-xs text-slate-200 block">{doc.fileName}</span>
                          <div className="flex gap-3 text-[10px] text-slate-500 mt-1 uppercase font-mono items-center">
                            <span>Chunks: <b className="text-slate-300">{doc.chunksCreated}</b></span>
                            <span>Categoría: <b className="text-slate-300">{doc.category.replace('_', ' ')}</b></span>
                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold shrink-0 ${
                              doc.language === 'en' 
                                ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' 
                                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            }`}>
                              {doc.language === 'en' ? '🇬🇧 EN' : '🇪🇸 ES'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        {/* Botón de Traducción Dinámica */}
                        <button
                          onClick={() => translateDocument(doc.id)}
                          disabled={uploading}
                          className="px-2.5 py-1 bg-brand-green-mid/10 hover:bg-brand-green-mid/20 text-[10px] text-brand-green-accent rounded-lg border border-brand-green-accent/20 transition cursor-pointer flex items-center gap-1"
                          title={`Traducir este documento al ${doc.language === 'es' ? 'Inglés' : 'Español'}`}
                        >
                          🌐 Traducir
                        </button>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400 font-semibold uppercase">
                            {doc.active ? 'Activo (RAG)' : 'Inactivo'}
                          </span>
                          <button
                            onClick={() => toggleDocStatus(doc.id, doc.active)}
                            className={`w-10 h-5 rounded-full p-0.5 transition-colors duration-200 cursor-pointer ${
                              doc.active ? 'bg-brand-green-accent' : 'bg-slate-700'
                            }`}
                          >
                            <div className={`bg-white w-4 h-4 rounded-full shadow transform transition-transform duration-200 ${
                              doc.active ? 'translate-x-5' : 'translate-x-0'
                            }`} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Pestaña 2: Tickets de Escalamiento */}
        {activeTab === 'tickets' && (
          <div className="flex-1 flex gap-6 overflow-hidden">
            {/* Lista de Tickets */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <h2 className="text-md font-bold text-slate-200 mb-4">Bandeja de Casos de Escalamiento ({tickets.length})</h2>

              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {tickets.length === 0 ? (
                  <div className="text-center py-16 text-slate-500 text-sm">
                    No hay casos de escalamiento generados.
                  </div>
                ) : (
                  tickets.map(ticket => (
                    <div 
                      key={ticket.id}
                      className={`p-4 border rounded-xl flex items-center justify-between transition cursor-pointer hover:bg-slate-800/40 ${
                        selectedTicketSession?.id === ticket.id 
                          ? 'bg-brand-green-mid/10 border-brand-green-accent/40' 
                          : 'bg-slate-800/30 border-brand-slate-border'
                      }`}
                      onClick={() => viewTicketContext(ticket)}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${
                          ticket.priority === 'critical' ? 'bg-rose-500 animate-pulse' :
                          (ticket.priority === 'high' ? 'bg-amber-500' : 'bg-slate-600')
                        }`} />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-slate-200">{ticket.id}</span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold ${
                              ticket.status === 'resolved' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                            }`}>
                              {ticket.status === 'resolved' ? 'RESUELTO' : 'ABIERTO'}
                            </span>
                          </div>
                          <span className="text-xs font-medium text-slate-300 block mt-1">Colaborador: {ticket.employeeName}</span>
                          <span className="text-[10px] text-slate-500 block mt-0.5 truncate max-w-md">Consulta: "{ticket.query}"</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => viewTicketContext(ticket)}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 rounded-lg border border-slate-700 cursor-pointer"
                        >
                          Contexto
                        </button>
                        {ticket.status === 'open' && (
                          <button
                            onClick={() => resolveTicket(ticket.id)}
                            className="px-3 py-1.5 bg-brand-green-mid hover:bg-brand-green-light text-xs text-white rounded-lg cursor-pointer"
                          >
                            Resolver
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Panel de contexto de la conversación */}
            {selectedTicketSession && (
              <div className="w-96 border-l border-brand-slate-border pl-6 flex flex-col overflow-hidden animate-fade-in-up">
                <div className="flex justify-between items-center border-b border-brand-slate-border pb-3 mb-4">
                  <div>
                    <h3 className="font-bold text-slate-200 text-xs">Historial de Conversación</h3>
                    <span className="text-[10px] text-slate-500 font-mono">Sesión: {selectedTicketSession.sessionId}</span>
                  </div>
                  <button 
                    onClick={() => setSelectedTicketSession(null)}
                    className="text-slate-400 hover:text-slate-200 text-xs cursor-pointer"
                  >
                    Cerrar
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-4 pr-1 mb-4">
                  {ticketHistory.map((m, idx) => (
                    <div key={m.id || idx} className={`space-y-1 ${m.role === 'user' ? 'text-right' : 'text-left'}`}>
                      <span className="text-[9px] text-slate-500 block">
                        {m.role === 'user' ? 'Colaborador' : 'Agente IA'} — {new Date(m.timestamp).toLocaleTimeString()}
                      </span>
                      <div className={`p-3 rounded-xl inline-block max-w-[90%] text-xs leading-relaxed ${
                        m.role === 'user' 
                          ? 'bg-slate-800 text-slate-200 rounded-tr-none' 
                          : 'bg-brand-green-mid/10 border border-brand-green-mid/20 text-slate-300 rounded-tl-none'
                      }`}>
                        {m.content}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="p-3 bg-slate-900/60 rounded-xl border border-brand-slate-border text-[11px] leading-normal text-slate-400">
                  <span className="font-bold text-slate-200 block mb-1">Causa de Escalamiento</span>
                  <p>Motivo: <b className="text-amber-400 capitalize">{selectedTicketSession.reason.replace('_', ' ')}</b></p>
                  <p className="mt-1">Mensaje Empático Generado por IA:</p>
                  <p className="italic text-slate-300 mt-0.5">"{selectedTicketSession.empatheticMessage}"</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Pestaña 3: Estadísticas y Gaps */}
        {activeTab === 'analytics' && (
          <div className="flex-1 flex flex-col overflow-y-auto space-y-6 pr-1">
            {/* Cabecera Filtros */}
            <div className="flex items-center justify-between border-b border-brand-slate-border pb-4">
              <h2 className="text-md font-bold text-slate-200 flex items-center gap-2">
                <BarChart2 size={18} className="text-brand-green-accent" />
                Métricas del Agente RRHH
              </h2>
              <div className="flex gap-3 text-xs items-center">
                <div>
                  <label className="text-[10px] text-slate-500 block mb-0.5">Desde</label>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="bg-slate-800 border border-brand-slate-border text-slate-200 rounded px-2 py-1 focus:outline-none focus:border-brand-green-accent cursor-pointer"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block mb-0.5">Hasta</label>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="bg-slate-800 border border-brand-slate-border text-slate-200 rounded px-2 py-1 focus:outline-none focus:border-brand-green-accent cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Grid de Tarjetas de Estadísticas */}
            {analytics && (
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-slate-800/30 p-4 border border-brand-slate-border rounded-xl">
                  <span className="text-[10px] text-slate-500 uppercase font-semibold">Consultas Totales</span>
                  <span className="text-2xl font-bold text-slate-100 block mt-1">{analytics.total_queries}</span>
                  <span className="text-[9px] text-slate-500 block mt-1">Registradas en el rango</span>
                </div>
                <div className="bg-slate-800/30 p-4 border border-brand-slate-border rounded-xl">
                  <span className="text-[10px] text-slate-500 uppercase font-semibold">Casos Escalados</span>
                  <span className="text-2xl font-bold text-rose-400 block mt-1">{analytics.total_escalations}</span>
                  <span className="text-[9px] text-slate-500 block mt-1">Requieren atención humana</span>
                </div>
                <div className="bg-slate-800/30 p-4 border border-brand-slate-border rounded-xl">
                  <span className="text-[10px] text-slate-500 uppercase font-semibold">Brechas Detectadas (Gaps)</span>
                  <span className="text-2xl font-bold text-amber-400 block mt-1">{analytics.unanswered_gaps}</span>
                  <span className="text-[9px] text-slate-500 block mt-1">Consultas sin info en PDFs</span>
                </div>
                <div className="bg-slate-800/30 p-4 border border-brand-slate-border rounded-xl">
                  <span className="text-[10px] text-slate-500 uppercase font-semibold">Tasa de Respuesta RAG</span>
                  <span className="text-2xl font-bold text-emerald-400 block mt-1">
                    {Math.round(analytics.accuracy_rate * 100)}%
                  </span>
                  <span className="text-[9px] text-slate-500 block mt-1">Resuelto de forma autónoma</span>
                </div>
              </div>
            )}

            {/* Dos Columnas: Top Preguntas vs Brechas de Información */}
            <div className="grid grid-cols-2 gap-6">
              {/* Top Preguntas */}
              <div className="bg-slate-800/20 border border-brand-slate-border rounded-xl p-4 flex flex-col h-80">
                <h3 className="text-xs font-bold text-slate-300 mb-3 flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-400" />
                  Preguntas Más Frecuentes
                </h3>
                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {topQueries.length === 0 ? (
                    <div className="text-center py-12 text-xs text-slate-600">Sin datos registrados</div>
                  ) : (
                    topQueries.map((q, idx) => (
                      <div key={idx} className="flex justify-between items-center p-2 bg-slate-800/40 rounded-lg text-xs">
                        <span className="text-slate-300 truncate max-w-[200px]">"{q.query}"</span>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-brand-green-accent">{q.count} veces</span>
                          {/* SVG Mini Bar */}
                          <div className="w-12 bg-slate-700 h-1.5 rounded-full overflow-hidden shrink-0">
                            <div className="bg-brand-green-accent h-full" style={{ width: `${Math.min(100, q.count * 10)}%` }}></div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Brechas (Consultas sin respuesta) */}
              <div className="bg-slate-800/20 border border-brand-slate-border rounded-xl p-4 flex flex-col h-80">
                <h3 className="text-xs font-bold text-slate-300 mb-3 flex items-center gap-2">
                  <AlertTriangle size={14} className="text-amber-400" />
                  Vacíos de Información (Gaps a corregir en RAG)
                </h3>
                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {unanswered.length === 0 ? (
                    <div className="text-center py-12 text-xs text-slate-600">Ningún gap detectado</div>
                  ) : (
                    unanswered.map((q, idx) => (
                      <div key={idx} className="flex justify-between items-center p-2 bg-slate-800/40 rounded-lg text-xs border-l-2 border-amber-500">
                        <span className="text-slate-300 truncate max-w-[180px]">"{q.query}"</span>
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-amber-400">{q.count} búsquedas</span>
                          <span className={`text-[8px] font-mono px-1 py-0.5 rounded ${
                            q.escalated ? 'bg-rose-500/20 text-rose-300' : 'bg-slate-700 text-slate-400'
                          }`}>
                            {q.escalated ? 'ESCALADO' : 'PENDIENTE'}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Fila inferior: Alertas / Estado de Configuración */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-slate-800/20 border border-brand-slate-border rounded-xl p-4 text-xs">
                <span className="font-semibold text-slate-300 block mb-2">Transporte de Correo (Ethereal SMTP)</span>
                <div className="flex items-start gap-2.5">
                  <Mail size={16} className="text-brand-green-accent mt-0.5" />
                  <div>
                    <span className="text-slate-400 block font-medium">Bandeja de salida de pruebas</span>
                    <span className="text-[10px] text-slate-500 block mt-1 leading-relaxed">
                      Genera links de previsualización interactiva en la consola del backend para cada correo de escalamiento enviado.
                    </span>
                  </div>
                </div>
              </div>
              <div className="bg-slate-800/20 border border-brand-slate-border rounded-xl p-4 text-xs">
                <span className="font-semibold text-slate-300 block mb-2">Estado del Servidor MCP</span>
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 size={16} className="text-brand-green-accent mt-0.5" />
                  <div>
                    <span className="text-slate-400 block font-medium">Capacidades Activas</span>
                    <span className="text-[10px] text-slate-500 block mt-1 font-mono">
                      - Tools: 9 registradas<br />
                      - Resources: 4 activos<br />
                      - Prompts: 3 plantillas
                    </span>
                  </div>
                </div>
              </div>
              <div className="bg-slate-800/20 border border-brand-slate-border rounded-xl p-4 text-xs">
                <span className="font-semibold text-slate-300 block mb-2">Canal de Notificaciones</span>
                <div className="flex items-start gap-2.5">
                  <AlertCircle size={16} className="text-brand-green-accent mt-0.5" />
                  <div>
                    <span className="text-slate-400 block font-medium">Correos del área</span>
                    <span className="text-[10px] text-slate-500 block mt-1 leading-normal">
                      Dirección destino: rrhh@garnier.com<br />
                      Prioridad de alerta: Crítica y Alta
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
