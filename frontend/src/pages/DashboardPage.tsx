import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  AlertTriangle,
  Clock,
  FileCheck2,
  AlertCircle,
  FileText,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { apiRequest } from '../api';

export function DashboardPage() {
  const [fdrs, setFdrs] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [fdrData, alertData] = await Promise.all([
          apiRequest('/api/fdrs'),
          apiRequest('/api/alerts'),
        ]);
        setFdrs(fdrData);
        setAlerts(alertData);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading FDR Vault metrics...</div>;
  }

  // Aggregate metrics
  const activeCount = fdrs.filter((f) => f.status === 'ACTIVE').length;
  const expiringCount = fdrs.filter((f) => f.status === 'EXPIRING').length;
  const lapsedCount = fdrs.filter((f) => f.status === 'LAPSED').length;
  const renewedCount = fdrs.filter((f) => f.status === 'RENEWED').length;
  const releasedCount = fdrs.filter((f) => f.status === 'RELEASED').length;
  const pendingCount = fdrs.filter((f) =>
    ['SUBMITTED', 'UNDER_SCRUTINY', 'DISCREPANCY', 'VERIFIED'].includes(f.status)
  ).length;

  const openHighDiscrepancies = fdrs
    .flatMap((f) => (f.discrepancies || []).map((d: any) => ({ ...d, fdrNo: f.fdrNo, fdrId: f.id })))
    .filter((d) => d.severity === 'HIGH' && d.status === 'OPEN');

  // Next 120 days maturities
  const now = new Date();
  const day120 = new Date(now.getTime() + 120 * 24 * 60 * 60 * 1000);
  const upcomingMaturities = fdrs
    .filter((f) => {
      const mat = new Date(f.maturityDate);
      return mat >= now && mat <= day120 && ['ACTIVE', 'EXPIRING'].includes(f.status);
    })
    .sort((a, b) => new Date(a.maturityDate).getTime() - new Date(b.maturityDate).getTime());

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight">Executive Dashboard</h1>
          <p className="text-xs text-slate-500">Real-time deposit overview, upcoming maturities, and compliance flags</p>
        </div>
        <Link
          to="/fdrs/new"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-aicte-700 hover:bg-aicte-800 text-white font-bold text-xs rounded-lg shadow transition"
        >
          <FileText className="w-4 h-4" />
          Submit New FDR
        </Link>
      </div>

      {/* STATUS BADGES */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-[11px] font-bold text-emerald-600 uppercase">Active Deposits</div>
          <div className="text-2xl font-black text-slate-800 mt-1">{activeCount}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/20 shadow-sm">
          <div className="text-[11px] font-bold text-amber-600 uppercase">Expiring (T-90)</div>
          <div className="text-2xl font-black text-amber-700 mt-1">{expiringCount}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-red-200 bg-red-50/20 shadow-sm">
          <div className="text-[11px] font-bold text-red-600 uppercase">Matured / Lapsed</div>
          <div className="text-2xl font-black text-red-700 mt-1">{lapsedCount}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-[11px] font-bold text-indigo-600 uppercase">Renewed</div>
          <div className="text-2xl font-black text-slate-800 mt-1">{renewedCount}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-[11px] font-bold text-purple-600 uppercase">Released / Refunded</div>
          <div className="text-2xl font-black text-slate-800 mt-1">{releasedCount}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-blue-200 bg-blue-50/20 shadow-sm">
          <div className="text-[11px] font-bold text-blue-600 uppercase">In Scrutiny / Review</div>
          <div className="text-2xl font-black text-blue-800 mt-1">{pendingCount}</div>
        </div>
      </div>

      {/* DUAL COLUMN: MATURITY TIMELINE + HIGH DISCREPANCIES */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming 120-Day Maturities */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-500" />
              <h2 className="text-sm font-bold text-slate-800">Maturity Horizon (Next 120 Days)</h2>
            </div>
            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-semibold">
              {upcomingMaturities.length} Due
            </span>
          </div>

          {upcomingMaturities.length === 0 ? (
            <div className="text-xs text-slate-400 py-6 text-center">No FDRs maturing in the next 120 days.</div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
              {upcomingMaturities.map((f) => {
                const diffDays = Math.ceil(
                  (new Date(f.maturityDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
                );
                return (
                  <div key={f.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <Link to={`/fdrs/${f.id}`} className="font-bold text-aicte-700 hover:underline">
                        {f.fdrNo}
                      </Link>
                      <div className="text-[11px] text-slate-500">
                        {f.bank} • ₹{Number(f.amount).toLocaleString('en-IN')}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-semibold text-slate-700">
                        {new Date(f.maturityDate).toLocaleDateString('en-IN')}
                      </span>
                      <div className={`text-[10px] font-bold ${diffDays <= 30 ? 'text-red-600' : 'text-amber-600'}`}>
                        Due in {diffDays} days
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Open High Discrepancies */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <h2 className="text-sm font-bold text-slate-800">Critical Discrepancies Requiring Action</h2>
            </div>
            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded font-semibold">
              {openHighDiscrepancies.length} Open HIGH
            </span>
          </div>

          {openHighDiscrepancies.length === 0 ? (
            <div className="text-xs text-slate-400 py-6 text-center">No open high-severity discrepancies!</div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
              {openHighDiscrepancies.map((d: any) => (
                <div key={d.id} className="py-2.5 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200">
                      {d.code}
                    </span>
                    <Link to={`/fdrs/${d.fdrId}`} className="text-aicte-700 font-bold hover:underline">
                      FDR {d.fdrNo}
                    </Link>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">{d.detail}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
