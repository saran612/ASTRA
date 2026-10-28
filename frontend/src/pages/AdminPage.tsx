import React, { useEffect, useState } from 'react';
import { Clock, Play, CheckCircle, ShieldCheck, Settings, AlertCircle } from 'lucide-react';
import { apiRequest } from '../api';

export function AdminPage() {
  const [rules, setRules] = useState<any[]>([]);
  const [targetDate, setTargetDate] = useState('2026-11-15');
  const [scanResult, setScanResult] = useState<any>(null);
  const [auditReport, setAuditReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const loadRules = async () => {
    try {
      const data = await apiRequest('/api/admin/rules');
      setRules(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadRules();
  }, []);

  const handleTimeTravel = async () => {
    try {
      setLoading(true);
      await apiRequest('/api/admin/clock/time-travel', {
        method: 'POST',
        body: JSON.stringify({ targetDate }),
      });
      window.location.reload();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRunJobsNow = async () => {
    try {
      setLoading(true);
      const res = await apiRequest('/api/admin/jobs/scan-now', { method: 'POST' });
      setScanResult(res);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAuditChain = async () => {
    try {
      setLoading(true);
      const res = await apiRequest('/api/admin/audit/verify-chain', { method: 'POST' });
      setAuditReport(res);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-black text-slate-900 tracking-tight">System Controls & Governance</h1>
        <p className="text-xs text-slate-500">
          Admin time travel simulation, cron job triggers, rules configuration, and audit chain verification
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* TIME TRAVEL PANEL */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Clock className="w-5 h-5 text-amber-500" />
            <h2 className="text-sm font-bold text-slate-900">Demo "Time Travel" Clock Offset</h2>
          </div>
          <p className="text-xs text-slate-600">
            Simulate forward dates to test T-90, T-60, T-30, T-7 reminder alarms, auto-lapsing, and escalation ladders.
          </p>
          <div className="flex gap-2">
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="text-xs border border-slate-300 rounded-lg px-3 py-2 flex-1 focus:outline-none focus:ring-2 focus:ring-aicte-500"
            />
            <button
              onClick={handleTimeTravel}
              disabled={loading}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg shadow transition"
            >
              Set Date
            </button>
          </div>
        </div>

        {/* ON-DEMAND JOB TRIGGER */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Play className="w-5 h-5 text-emerald-600" />
            <h2 className="text-sm font-bold text-slate-900">Deadline Scanner (Manual Trigger)</h2>
          </div>
          <p className="text-xs text-slate-600">
            Executes the daily deadline scan immediately using current simulated clock time.
          </p>
          <button
            onClick={handleRunJobsNow}
            disabled={loading}
            className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow transition"
          >
            Run Scan Job Now
          </button>
          {scanResult && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
              <div className="font-bold text-emerald-700">Scan Complete!</div>
              <div>Evaluated FDRs: {scanResult.evaluatedFdrs}</div>
              <div>Alerts Dispatched: {scanResult.alertsFired}</div>
              <div>Auto Transitions: {scanResult.autoTransitions}</div>
            </div>
          )}
        </div>
      </div>

      {/* CRYPTOGRAPHIC AUDIT VERIFICATION */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-indigo-600" />
            <h2 className="text-sm font-bold text-slate-900">Cryptographic Audit Hash-Chain Verification</h2>
          </div>
          <button
            onClick={handleVerifyAuditChain}
            disabled={loading}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg shadow transition"
          >
            Verify Whole Chain
          </button>
        </div>
        <p className="text-xs text-slate-600">
          Recursively recalculates SHA-256 hash chains across all insert-only audit entries to verify that zero entries have been tampered with or modified.
        </p>
        {auditReport && (
          <div
            className={`p-3 rounded-lg border text-xs font-semibold ${
              auditReport.valid
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            {auditReport.valid
              ? `CHAIN INTEGRITY VERIFIED: All ${auditReport.totalRows} audit entries match SHA-256 hash sequence perfectly.`
              : `TAMPER DETECTED: Chain broken at record ID ${auditReport.corruptedAtId}`}
          </div>
        )}
      </div>

      {/* RULES CONFIG EDITOR */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Settings className="w-5 h-5 text-slate-600" />
          <h2 className="text-sm font-bold text-slate-900">Configurable Rules & AICTE Deposit Slabs</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {rules.map((r) => (
            <div key={r.key} className="py-3 space-y-1 text-xs">
              <div className="flex items-center justify-between font-bold">
                <span className="text-slate-900 font-mono">{r.key}</span>
                <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-[10px]">
                  {r.source}
                </span>
              </div>
              <p className="text-slate-500">{r.note}</p>
              <pre className="p-2 bg-slate-50 rounded border border-slate-200 text-[11px] font-mono overflow-x-auto text-slate-800">
                {JSON.stringify(r.value, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
