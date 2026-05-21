import React, { useState } from 'react';
import ChatInterface from './components/ChatInterface';
import AdminDashboard from './components/AdminDashboard';
import { Shield, MessageSquare, Users, Sparkles, Building2 } from 'lucide-react';

export default function App() {
  // Empleados disponibles para simular roles en la demo
  const mockEmployees = [
    { id: 'EMP002', name: 'Sofía Delgado', role: 'employee', detail: 'Colaborador Regular', onboardingCompleted: true },
    { id: 'EMP003', name: 'Luis Brenes', role: 'employee', detail: 'Nuevo Ingreso (Onboarding)', onboardingCompleted: false },
    { id: 'EMP001', name: 'Carlos Garnier', role: 'hr_admin', detail: 'Administrador de RRHH', onboardingCompleted: true }
  ];

  const [activeEmployee, setActiveEmployee] = useState(mockEmployees[0]);
  const [activeSession, setActiveSession] = useState('');
  const [currentView, setCurrentView] = useState('chat'); // 'chat' | 'admin'

  const handleRoleChange = (e) => {
    const selected = mockEmployees.find(emp => emp.id === e.target.value);
    setActiveEmployee(selected);
    setActiveSession(''); // Limpiar sesión para forzar recarga
    if (selected.role !== 'hr_admin') {
      setCurrentView('chat');
    }
  };

  return (
    <div className="min-h-screen bg-brand-slate-dark text-slate-100 flex flex-col">
      {/* Header Corporativo Garnier & Garnier */}
      <header className="px-6 py-4 border-b border-brand-slate-border bg-slate-900/60 backdrop-blur flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-green-mid to-brand-green-light flex items-center justify-center text-white shadow-lg animate-pulse-green">
            <Building2 size={22} />
          </div>
          <div>
            <h1 className="text-lg font-bold bg-gradient-to-r from-emerald-400 to-teal-200 bg-clip-text text-transparent leading-none">
              Garnier & Garnier
            </h1>
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest mt-1 block">
              Desarrollo Humano — Asistente Inteligente
            </span>
          </div>
        </div>

        {/* Controles del Simulador */}
        <div className="flex items-center gap-4">
          {/* Selector de Simulación de Empleado */}
          <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-brand-slate-border">
            <Users size={14} className="text-brand-green-accent" />
            <span className="text-xs text-slate-400 font-medium">Simular Rol:</span>
            <select
              value={activeEmployee.id}
              onChange={handleRoleChange}
              className="bg-transparent border-none focus:outline-none text-xs text-slate-200 font-semibold cursor-pointer"
            >
              {mockEmployees.map(emp => (
                <option key={emp.id} value={emp.id} className="bg-slate-800 text-slate-300">
                  {emp.name} ({emp.detail})
                </option>
              ))}
            </select>
          </div>

          {/* Selector de Vistas si es Admin */}
          {activeEmployee.role === 'hr_admin' && (
            <div className="flex bg-slate-800/80 p-1 rounded-xl border border-brand-slate-border">
              <button
                onClick={() => setCurrentView('chat')}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
                  currentView === 'chat'
                    ? 'bg-brand-green-mid text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <MessageSquare size={13} />
                Portal
              </button>
              <button
                onClick={() => setCurrentView('admin')}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
                  currentView === 'admin'
                    ? 'bg-brand-green-mid text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Shield size={13} />
                Admin
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Contenido de la Aplicación */}
      <main className="flex-1 p-6 flex flex-col overflow-hidden max-w-7xl w-full mx-auto">
        {currentView === 'chat' ? (
          <ChatInterface 
            activeEmployee={activeEmployee} 
            activeSession={activeSession}
            setActiveSession={setActiveSession}
          />
        ) : (
          <AdminDashboard 
            activeEmployee={activeEmployee}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="py-3 text-center border-t border-brand-slate-border bg-slate-900/30 text-[10px] text-slate-500 font-mono">
        Garnier & Garnier RRHH MCP Server v1.0 | Mayo 2026
      </footer>
    </div>
  );
}
