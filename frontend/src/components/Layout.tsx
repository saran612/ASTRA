import React, { useEffect, useState } from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  ShieldAlert,
  Clock as ClockIcon,
  FileCheck2,
  ListTree,
  Sliders,
  LogOut,
  Building2,
  CheckCircle2,
  AlertTriangle,
  History,
  FileText,
} from 'lucide-react';
import { getCurrentUser, clearAuthSession, apiRequest } from '../api';

export function Layout() {
  const user = getCurrentUser();
  const navigate = useNavigate();
  const location = useLocation();

  const [clockStatus, setClockStatus] = useState<{
    currentClock: string;
    isSimulated: boolean;
  }>({
    currentClock: new Date().toISOString(),
    isSimulated: false,
  });

  const fetchClock = async () => {
    try {
      const data = await apiRequest('/api/admin/clock/status');
      setClockStatus({
        currentClock: data.currentClock,
        isSimulated: data.isSimulated,
      });
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchClock();
    const interval = setInterval(fetchClock, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleResetClock = async () => {
    try {
      await apiRequest('/api/admin/clock/reset', { method: 'POST' });
      await fetchClock();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleLogout = () => {
    clearAuthSession();
    navigate('/login');
  };

  if (!user) {
    return <Outlet />;
  }

  const roleColors: Record<string, string> = {
    INSTITUTION: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    OFFICER: 'bg-blue-100 text-blue-800 border-blue-300',
    AUTHORITY: 'bg-purple-100 text-purple-800 border-purple-300',
    ADMIN: 'bg-amber-100 text-amber-800 border-amber-300',
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800">
      {/* SIMULATED DATE BANNER */}
      {clockStatus.isSimulated && (
        <div className="bg-amber-500 text-white px-4 py-2 font-semibold text-sm flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2">
            <ClockIcon className="w-5 h-5 animate-pulse" />
            <span>
              SIMULATED DEMO DATE ACTIVE: {new Date(clockStatus.currentClock).toLocaleDateString('en-IN', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </span>
            <span className="text-xs bg-amber-700 px-2 py-0.5 rounded text-amber-100">
              Admin Time Travel In Effect
            </span>
          </div>
          {user.role === 'ADMIN' && (
            <button
              onClick={handleResetClock}
              className="bg-white text-amber-900 text-xs px-2.5 py-1 rounded hover:bg-amber-50 font-bold transition"
            >
              Reset to Real Clock
            </button>
          )}
        </div>
      )}

      {/* TOP HEADER */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-aicte-700 text-white p-2 rounded-lg font-black text-lg tracking-wider flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 text-sky-300" />
              <span>FDR VAULT</span>
            </div>
            <div className="hidden sm:block border-l border-slate-300 pl-3">
              <div className="text-xs font-semibold text-slate-600">AICTE Regulation Bureau</div>
              <div className="text-[11px] text-slate-400">Security Deposit / FDR Management</div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-bold text-slate-800">{user.email}</div>
              <div className="text-[11px] text-slate-500 flex items-center justify-end gap-1">
                {user.institutionName && <span>{user.institutionName} • </span>}
                <span className={`px-1.5 py-0.2 rounded border text-[10px] font-bold ${roleColors[user.role]}`}>
                  {user.role}
                </span>
              </div>
            </div>

            <button
              onClick={handleLogout}
              title="Logout"
              className="p-2 text-slate-500 hover:text-red-600 hover:bg-slate-100 rounded-lg transition"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* NAVIGATION BAR */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex gap-6 text-sm font-medium border-t border-slate-100 overflow-x-auto">
          <Link
            to="/dashboard"
            className={`py-3 border-b-2 flex items-center gap-1.5 transition ${
              location.pathname === '/dashboard'
                ? 'border-aicte-700 text-aicte-700 font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <ListTree className="w-4 h-4" />
            Dashboard
          </Link>
          <Link
            to="/fdrs"
            className={`py-3 border-b-2 flex items-center gap-1.5 transition ${
              location.pathname.startsWith('/fdrs')
                ? 'border-aicte-700 text-aicte-700 font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-4 h-4" />
            FDR Repository
          </Link>

          {(user.role === 'OFFICER' || user.role === 'ADMIN' || user.role === 'AUTHORITY') && (
            <Link
              to="/scrutiny"
              className={`py-3 border-b-2 flex items-center gap-1.5 transition ${
                location.pathname === '/scrutiny'
                  ? 'border-aicte-700 text-aicte-700 font-bold'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileCheck2 className="w-4 h-4" />
              Officer Queue
            </Link>
          )}

          {user.role === 'ADMIN' && (
            <Link
              to="/admin"
              className={`py-3 border-b-2 flex items-center gap-1.5 transition ${
                location.pathname === '/admin'
                  ? 'border-aicte-700 text-aicte-700 font-bold'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sliders className="w-4 h-4" />
              Admin & Controls
            </Link>
          )}
        </div>
      </header>

      {/* MAIN BODY */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Outlet />
      </main>

      {/* FOOTER */}
      <footer className="bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-500">
        AICTE FDR Vault (SIH26265 Prototype) • Strict Append-Only State Machine & Verified Trust System
      </footer>
    </div>
  );
}
