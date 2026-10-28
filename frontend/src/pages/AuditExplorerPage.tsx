import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  AlertOctagon,
  RefreshCw,
  Search,
  Filter,
  FileCode,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react';
import { apiRequest } from '../api';

export function AuditExplorerPage() {
  const [report, setReport] = useState<any>(null);
  const [verifying, setVerifying] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [entityFilter, setEntityFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const verifyChain = async () => {
    setVerifying(true);
    try {
      const data = await apiRequest('/api/audit/verify');
      setReport(data);
    } catch (e: any) {
      setReport({ valid: false, error: e.message });
    } finally {
      setVerifying(false);
    }
  };

  const loadLogs = async () => {
    setLoadingLogs(true);
    try {
      let url = '/api/audit/logs?limit=100';
      if (entityFilter.trim()) {
        url += `&entityId=${encodeURIComponent(entityFilter.trim())}`;
      }
      const data = await apiRequest(url);
      setLogs(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    verifyChain();
    loadLogs();
  }, []);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(text);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const filteredLogs = logs.filter((log) => {
    if (actionFilter && !log.action.toLowerCase().includes(actionFilter.toLowerCase())) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-indigo-700" />
            Live Cryptographic Audit Trail Explorer
          </h1>
          <p className="text-xs text-slate-500">
            Immutable SHA-256 backward-linked hash chain ledger recording every statutory state change.
          </p>
        </div>

        <button
          onClick={verifyChain}
          disabled={verifying}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg shadow transition self-start disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${verifying ? 'animate-spin' : ''}`} />
          {verifying ? 'Verifying Block Chain...' : 'Re-Verify Whole Chain'}
        </button>
      </div>

      {/* VERIFICATION BANNER */}
      {report && (
        <div
          className={`p-4 rounded-xl border shadow-sm ${
            report.valid
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-red-50 border-red-300 text-red-900'
          }`}
        >
          {report.valid ? (
            <div className="flex items-start gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg shrink-0 mt-0.5">
                <ShieldCheck className="w-6 h-6 text-emerald-700" />
              </div>
              <div className="space-y-1">
                <div className="text-sm font-black flex items-center gap-2">
                  <span>CHAIN INTEGRITY VERIFIED (100% INTACT)</span>
                  <span className="text-xs px-2 py-0.5 bg-emerald-200 text-emerald-800 rounded font-bold">
                    {report.totalRows} Verified Blocks
                  </span>
                </div>
                <p className="text-xs text-emerald-800">
                  Every log entry successfully validates backward from the tip block to Genesis ({report.genesisHash?.slice(0, 16)}...). No intermediate records deleted, swapped, or altered.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <div className="p-2 bg-red-100 rounded-lg shrink-0 mt-0.5">
                <AlertOctagon className="w-6 h-6 text-red-700" />
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="text-sm font-black text-red-900 flex items-center gap-2">
                  <span>TAMPER DETECTED: Cryptographic Breakpoint Alert</span>
                  <span className="text-xs px-2 py-0.5 bg-red-200 text-red-800 rounded font-bold">
                    SECURITY ALERT
                  </span>
                </div>
                <p className="text-red-800">
                  The mathematical SHA-256 chain has been broken. Database tampering or unauthorized modification detected!
                </p>
                <div className="bg-red-100 p-2.5 rounded-lg font-mono text-[11px] space-y-1 border border-red-200">
                  <div>Corrupted Block ID: <span className="font-bold">{report.corruptedAtId || 'Unknown'}</span></div>
                  <div>Expected prevHash: <span className="font-bold">{report.expectedPrevHash || 'N/A'}</span></div>
                  <div>Actual prevHash: <span className="font-bold">{report.actualPrevHash || 'N/A'}</span></div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* FILTER CONTROLS */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-3 text-xs">
        <div className="flex-1 relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadLogs()}
            placeholder="Filter by Entity ID (e.g. FDR UUID)..."
            className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:outline-none"
          />
        </div>

        <div className="sm:w-56">
          <input
            type="text"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            placeholder="Filter by Action (e.g. SUBMIT, VERIFY)..."
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:outline-none"
          />
        </div>

        <button
          onClick={loadLogs}
          disabled={loadingLogs}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg shadow-sm transition shrink-0"
        >
          {loadingLogs ? 'Loading...' : 'Apply Filters'}
        </button>
      </div>

      {/* LOG ENTRIES TABLE */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden text-xs">
        <div className="p-3.5 bg-slate-50 border-b border-slate-200 font-bold text-slate-700 flex justify-between items-center">
          <span>Cryptographic Block Sequence ({filteredLogs.length} blocks)</span>
          <span className="text-[11px] text-slate-500 font-normal">Genesis Hash: 0000000000000000000000000000000000000000000000000000000000000000</span>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="text-center py-10 text-slate-400">No audit log records match the selected filters.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredLogs.map((log) => {
              const isExpanded = expandedRow === log.id;
              return (
                <div key={log.id} className="hover:bg-slate-50/70 transition">
                  <div
                    onClick={() => setExpandedRow(isExpanded ? null : log.id)}
                    className="p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer"
                  >
                    <div className="flex items-start md:items-center gap-3">
                      <div className="text-slate-400 pt-0.5 md:pt-0">
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </div>

                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 font-mono">{log.action}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200">
                            {log.entityType}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          Entity: {log.entityId}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col md:items-end gap-1 text-[11px]">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">
                          {new Date(log.ts).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                        </span>
                        <span className="text-slate-400">•</span>
                        <span className="font-mono text-slate-600">Actor: {log.actorId ? log.actorId.slice(0, 8) : 'SYSTEM'}</span>
                      </div>

                      <div className="flex items-center gap-2 font-mono text-[10px] text-slate-400">
                        <span>Hash: {log.hash.slice(0, 16)}...</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopy(log.hash);
                          }}
                          className="hover:text-slate-700"
                          title="Copy full block hash"
                        >
                          {copiedHash === log.hash ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Expanded block metadata */}
                  {isExpanded && (
                    <div className="p-4 bg-slate-900 text-slate-200 text-[11px] font-mono border-t border-slate-200 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-slate-300">
                        <div>
                          <div className="text-slate-500 text-[10px]">CURRENT BLOCK HASH:</div>
                          <div className="break-all text-emerald-400 font-bold">{log.hash}</div>
                        </div>
                        <div>
                          <div className="text-slate-500 text-[10px]">PREVIOUS BLOCK HASH (prevHash):</div>
                          <div className="break-all text-indigo-400">{log.prevHash}</div>
                        </div>
                      </div>

                      <div>
                        <div className="text-slate-500 text-[10px] mb-1">CANONICAL ROW PAYLOAD:</div>
                        <pre className="p-2.5 bg-slate-950 rounded border border-slate-800 text-[11px] overflow-x-auto text-amber-200">
                          {JSON.stringify(log.payload, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
