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
  Building2,
  CheckCircle2,
  Sparkles,
  Layers,
  History,
  Download,
} from 'lucide-react';
import { apiRequest, getCurrentUser } from '../api';

export function DashboardPage() {
  const user = getCurrentUser();
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
  const pendingScrutinyCount = fdrs.filter((f) =>
    ['SUBMITTED', 'UNDER_SCRUTINY'].includes(f.status)
  ).length;
  const discrepancyCount = fdrs.filter((f) => f.status === 'DISCREPANCY').length;

  const totalValueLocked = fdrs
    .filter((f) => ['ACTIVE', 'EXPIRING', 'VERIFIED'].includes(f.status))
    .reduce((sum, f) => sum + Number(f.amount || 0), 0);

  const openHighDiscrepancies = fdrs
    .flatMap((f) => (f.discrepancies || []).map((d: any) => ({ ...d, fdrNo: f.fdrNo, fdrId: f.id, instName: f.institution?.name })))
    .filter((d) => d.severity === 'HIGH' && d.status === 'OPEN');

  const now = new Date();
  const day30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const day60 = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const day90 = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const mat30 = fdrs.filter((f) => {
    const d = new Date(f.maturityDate);
    return d >= now && d <= day30 && ['ACTIVE', 'EXPIRING'].includes(f.status);
  });
  const mat60 = fdrs.filter((f) => {
    const d = new Date(f.maturityDate);
    return d > day30 && d <= day60 && ['ACTIVE', 'EXPIRING'].includes(f.status);
  });
  const mat90 = fdrs.filter((f) => {
    const d = new Date(f.maturityDate);
    return d > day60 && d <= day90 && ['ACTIVE', 'EXPIRING'].includes(f.status);
  });

  const pendingReleaseApprovals = fdrs.filter((f) =>
    ['RELEASE_REQUESTED', 'RELEASE_APPROVED'].includes(f.status)
  );

  const isRegional = user?.role === 'REGIONAL_OFFICER' || user?.role === 'OFFICER';
  const isBureau = user?.role === 'BUREAU' || user?.role === 'AUTHORITY';
  const isCommittee = user?.role === 'COMMITTEE';
  const isInstitution = user?.role === 'INSTITUTION';

  return (
    <div className="space-y-6">
      {/* HEADER WITH ROLE BADGE */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black text-slate-900 tracking-tight">
              {isRegional && `Regional Scrutiny & Verification Desk (${user?.region || 'Northern'} Region)`}
              {isBureau && 'Bureau of Regulation & Executive Clearance (Apex Authority)'}
              {isCommittee && 'Standing Hearing Committee & Enforcement Oversight Portal'}
              {isInstitution && `${user?.institutionName || 'Technical Institution'} Deposit Portal`}
              {user?.role === 'ADMIN' && 'AICTE Executive Governance Dashboard'}
            </h1>
            <span className="text-[10px] px-2 py-0.5 rounded font-black bg-slate-800 text-white uppercase">
              {user?.role}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {isRegional && 'Regional officer queues, scrutiny SLA countdowns, and bank verification tracking.'}
            {isBureau && 'Pan-India deposit aggregates, active liquidity locked, and final release clearance queue.'}
            {isCommittee && 'Escalated regulatory discrepancies, chronic non-compliance cases, and proposed forfeitures.'}
            {isInstitution && 'Track active guarantee instruments, expiry countdowns, and renewal obligations.'}
            {user?.role === 'ADMIN' && 'Real-time deposit overview, upcoming maturities, and system-wide integrity metrics.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="/api/reports/fdrs/export.csv"
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-lg shadow-sm transition"
          >
            <Download className="w-4 h-4 text-slate-500" />
            Export CSV
          </a>
          {isInstitution ? (
            <Link
              to="/fdrs/new"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-lg shadow transition"
            >
              <FileText className="w-4 h-4" />
              Upload Renewal / New FDR
            </Link>
          ) : (
            <Link
              to="/scrutiny"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-aicte-700 hover:bg-aicte-800 text-white font-bold text-xs rounded-lg shadow transition"
            >
              <FileCheck2 className="w-4 h-4" />
              {isBureau ? 'Release Clearances' : 'Scrutiny Queue'}
            </Link>
          )}
        </div>
      </div>

      {/* 1. REGIONAL OFFICER VIEW */}
      {isRegional && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-xl border border-blue-200 bg-blue-50/20 shadow-sm">
              <div className="text-[11px] font-bold text-blue-700 uppercase">Scrutiny Queue</div>
              <div className="text-2xl font-black text-blue-900 mt-1">{pendingScrutinyCount}</div>
              <div className="text-[10px] text-blue-600 mt-0.5 font-medium">Pending Initial Scrutiny</div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/20 shadow-sm">
              <div className="text-[11px] font-bold text-amber-700 uppercase">Scrutiny Reverts</div>
              <div className="text-2xl font-black text-amber-900 mt-1">{discrepancyCount}</div>
              <div className="text-[10px] text-amber-600 mt-0.5 font-medium">Under Institution Correction</div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-sm">
              <div className="text-[11px] font-bold text-emerald-700 uppercase">Active FDRs</div>
              <div className="text-2xl font-black text-emerald-900 mt-1">{activeCount}</div>
              <div className="text-[10px] text-emerald-600 mt-0.5 font-medium">In Regional Jurisdiction</div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-red-200 bg-red-50/20 shadow-sm">
              <div className="text-[11px] font-bold text-red-700 uppercase">Expiring (T-90)</div>
              <div className="text-2xl font-black text-red-900 mt-1">{expiringCount}</div>
              <div className="text-[10px] text-red-600 mt-0.5 font-medium">Mandatory Renewal Due</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <FileCheck2 className="w-4 h-4 text-blue-600" />
                  Regional Scrutiny Worklist
                </h2>
                <Link to="/scrutiny" className="text-xs text-aicte-700 font-bold hover:underline">
                  View Full Queue &rarr;
                </Link>
              </div>
              <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                {fdrs.filter((f) => ['SUBMITTED', 'UNDER_SCRUTINY'].includes(f.status)).map((f) => (
                  <div key={f.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <Link to={`/fdrs/${f.id}`} className="font-bold text-aicte-700 hover:underline">
                        {f.fdrNo}
                      </Link>
                      <div className="text-[11px] text-slate-500">{f.institution?.name} • ₹{Number(f.amount).toLocaleString('en-IN')}</div>
                    </div>
                    <Link
                      to={`/fdrs/${f.id}`}
                      className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded font-bold hover:bg-blue-100 transition"
                    >
                      Scrutinize &rarr;
                    </Link>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-600" />
                  Expiring Instruments (Regional Notice Due)
                </h2>
                <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-bold">
                  {expiringCount} Due
                </span>
              </div>
              <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                {fdrs.filter((f) => f.status === 'EXPIRING').map((f) => (
                  <div key={f.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <Link to={`/fdrs/${f.id}`} className="font-bold text-slate-800 hover:underline">
                        {f.fdrNo}
                      </Link>
                      <div className="text-[11px] text-slate-500">{f.institution?.name}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-slate-700">{new Date(f.maturityDate).toLocaleDateString('en-IN')}</div>
                      <span className="text-[10px] text-red-600 font-bold">T-90 Alert Dispatched</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. BUREAU / AUTHORITY VIEW */}
      {isBureau && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-xl border border-indigo-200 bg-indigo-50/20 shadow-sm">
              <div className="text-[11px] font-bold text-indigo-700 uppercase">Value Locked in Trust</div>
              <div className="text-2xl font-black text-indigo-950 mt-1">₹{(totalValueLocked / 10000000).toFixed(2)} Cr</div>
              <div className="text-[10px] text-indigo-600 mt-0.5 font-medium">Pan-India Regulatory Collateral</div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-sm">
              <div className="text-[11px] font-bold text-emerald-700 uppercase">Total Active Instruments</div>
              <div className="text-2xl font-black text-emerald-950 mt-1">{activeCount}</div>
              <div className="text-[10px] text-emerald-600 mt-0.5 font-medium">Active Bank Fixed Deposits</div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-purple-200 bg-purple-50/20 shadow-sm">
              <div className="text-[11px] font-bold text-purple-700 uppercase">Pending Release Orders</div>
              <div className="text-2xl font-black text-purple-950 mt-1">{pendingReleaseApprovals.length}</div>
              <div className="text-[10px] text-purple-600 mt-0.5 font-medium">Awaiting 2-Tier Sign-off</div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-red-200 bg-red-50/20 shadow-sm">
              <div className="text-[11px] font-bold text-red-700 uppercase">Cross-Region Flags</div>
              <div className="text-2xl font-black text-red-950 mt-1">{openHighDiscrepancies.length}</div>
              <div className="text-[10px] text-red-600 mt-0.5 font-medium">Slab / Duplicate Violations</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Clock className="w-4 h-4 text-red-500" />
                Maturing in 30 Days (T-30)
              </h2>
              <div className="text-xl font-black text-red-700">{mat30.length} Deposits</div>
              <p className="text-[11px] text-slate-500">Auto-escalation to Bureau underway. Cure notices dispatched.</p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" />
                Maturing in 60 Days (T-60)
              </h2>
              <div className="text-xl font-black text-amber-700">{mat60.length} Deposits</div>
              <p className="text-[11px] text-slate-500">Second renewal reminder active on institution portals.</p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-500" />
                Maturing in 90 Days (T-90)
              </h2>
              <div className="text-xl font-black text-indigo-700">{mat90.length} Deposits</div>
              <p className="text-[11px] text-slate-500">Initial expiration alert sent via multi-channel notifier.</p>
            </div>
          </div>
        </div>
      )}

      {/* 3. COMMITTEE VIEW */}
      {isCommittee && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-white p-4 rounded-xl border border-red-200 bg-red-50/20 shadow-sm">
              <div className="text-[11px] font-bold text-red-700 uppercase">Escalated Discrepancies</div>
              <div className="text-2xl font-black text-red-900 mt-1">{openHighDiscrepancies.length}</div>
              <div className="text-[10px] text-red-600 mt-0.5 font-medium">Referred for Hearing</div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/20 shadow-sm">
              <div className="text-[11px] font-bold text-amber-700 uppercase">Proposed Forfeitures</div>
              <div className="text-2xl font-black text-amber-900 mt-1">{lapsedCount}</div>
              <div className="text-[10px] text-amber-600 mt-0.5 font-medium">Lapsed Without Auto-Renewal</div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-indigo-200 bg-indigo-50/20 shadow-sm">
              <div className="text-[11px] font-bold text-indigo-700 uppercase">Unresolved Deficiencies</div>
              <div className="text-2xl font-black text-indigo-900 mt-1">{discrepancyCount}</div>
              <div className="text-[10px] text-indigo-600 mt-0.5 font-medium">Repeat Reverts Pending</div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-2">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              Statutory Hearing Referral Cases (Critical Severity)
            </h2>
            <div className="divide-y divide-slate-100">
              {openHighDiscrepancies.map((d: any) => (
                <div key={d.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-200 font-mono">
                        {d.code}
                      </span>
                      <span className="font-bold text-slate-900">{d.instName || 'Technical Institution'}</span>
                    </div>
                    <p className="text-slate-600 mt-1">{d.detail}</p>
                  </div>
                  <Link
                    to={`/fdrs/${d.fdrId}`}
                    className="px-3 py-1.5 bg-slate-900 text-white font-bold rounded text-xs hover:bg-black transition self-start sm:self-auto shrink-0"
                  >
                    Examine Case &rarr;
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 4. INSTITUTION VIEW */}
      {isInstitution && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-sm">
              <div className="text-[11px] font-bold text-emerald-700 uppercase">Active Deposits</div>
              <div className="text-2xl font-black text-emerald-900 mt-1">{activeCount}</div>
              <div className="text-[10px] text-emerald-600 mt-0.5 font-medium">In Good Regulatory Standing</div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/20 shadow-sm">
              <div className="text-[11px] font-bold text-amber-700 uppercase">Renewal Required</div>
              <div className="text-2xl font-black text-amber-900 mt-1">{expiringCount}</div>
              <div className="text-[10px] text-amber-600 mt-0.5 font-medium">Maturing within 90 Days</div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-blue-200 bg-blue-50/20 shadow-sm">
              <div className="text-[11px] font-bold text-blue-700 uppercase">Under Review</div>
              <div className="text-2xl font-black text-blue-900 mt-1">{pendingScrutinyCount}</div>
              <div className="text-[10px] text-blue-600 mt-0.5 font-medium">Scrutiny / Verification</div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-purple-200 bg-purple-50/20 shadow-sm">
              <div className="text-[11px] font-bold text-purple-700 uppercase">Released / Refunded</div>
              <div className="text-2xl font-black text-purple-900 mt-1">{releasedCount}</div>
              <div className="text-[10px] text-purple-600 mt-0.5 font-medium">NOC Granted</div>
            </div>
          </div>

          {expiringCount > 0 && (
            <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="space-y-1">
                <div className="font-bold text-amber-900 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-700" />
                  Mandatory Renewal Alert: {expiringCount} FDR Instrument(s) Expiring
                </div>
                <p className="text-amber-800 text-[11px]">
                  AICTE Approval Process Handbook mandates renewal with joint lien marking prior to maturity to prevent lapsing penalties.
                </p>
              </div>
              <Link
                to="/fdrs/new"
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg shadow-sm transition shrink-0"
              >
                Upload Renewal Receipt &rarr;
              </Link>
            </div>
          )}
        </div>
      )}

      {/* 5. ADMIN VIEW (ALL CARDS + CONTROLS) */}
      {user?.role === 'ADMIN' && (
        <div className="space-y-6">
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
              <div className="text-[11px] font-bold text-purple-600 uppercase">Released</div>
              <div className="text-2xl font-black text-slate-800 mt-1">{releasedCount}</div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-blue-200 bg-blue-50/20 shadow-sm">
              <div className="text-[11px] font-bold text-blue-600 uppercase">In Scrutiny</div>
              <div className="text-2xl font-black text-blue-800 mt-1">{pendingScrutinyCount}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
