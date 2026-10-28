import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ShieldCheck,
  FileText,
  AlertTriangle,
  History,
  Download,
  Building2,
  Calendar,
  Lock,
  RefreshCw,
  Send,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { apiRequest, getCurrentUser } from '../api';

export function FdrDetailPage() {
  const { id } = useParams<{ id: string }>();
  const user = getCurrentUser();
  const [fdr, setFdr] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [resolveModal, setResolveModal] = useState<{ open: boolean; discrepancyId?: string; code?: string; severity?: string; remarks: string }>({
    open: false,
    remarks: '',
  });

  const loadFdr = async () => {
    try {
      const data = await apiRequest(`/api/fdrs/${id}`);
      setFdr(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFdr();
  }, [id]);

  if (loading) {
    return <div className="p-8 text-center text-xs text-slate-400">Loading FDR details...</div>;
  }

  if (!fdr) {
    return <div className="p-8 text-center text-xs text-red-500">FDR not found or unauthorized.</div>;
  }

  // Get signed download URL for document
  const handleDownloadDoc = async (docId: string) => {
    try {
      const res = await apiRequest(`/api/fdrs/documents/${docId}/signed-url`);
      window.open(res.downloadUrl, '_blank');
    } catch (e: any) {
      alert(`Download failed: ${e.message}`);
    }
  };

  // Resolve discrepancy
  const handleResolveDiscrepancy = async () => {
    if (!resolveModal.discrepancyId) return;
    try {
      await apiRequest(`/api/discrepancies/${resolveModal.discrepancyId}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ remarks: resolveModal.remarks }),
      });
      setResolveModal({ open: false, remarks: '' });
      await loadFdr();
    } catch (e: any) {
      alert(e.message);
    }
  };

  // Helper for field trust badge
  const renderTrustBadge = (fieldName: string) => {
    const trust = fdr.fieldTrusts?.find((t: any) => t.field === fieldName);
    if (!trust) {
      return (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-bold">
          UNTRACKED
        </span>
      );
    }

    if (trust.source === 'BANK_CONFIRMED') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-black bg-teal-100 text-teal-800 border border-teal-300">
          <ShieldCheck className="w-3 h-3 text-teal-700" />
          BANK_CONFIRMED
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-semibold bg-amber-100 text-amber-800 border border-amber-300">
        CLAIMED (INSTITUTION)
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* HEADER & SUMMARY */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">FDR #{fdr.fdrNo}</h1>
            <span className="px-2.5 py-0.5 rounded font-black text-xs uppercase bg-slate-800 text-white">
              {fdr.status}
            </span>
          </div>
          <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-400" />
            <span className="font-bold text-slate-700">{fdr.institution?.name}</span>
            <span>(AICTE ID: {fdr.institution?.aicteId})</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[11px] font-bold text-slate-400 uppercase">Deposit Amount</div>
            <div className="text-xl font-black text-emerald-700">₹{Number(fdr.amount).toLocaleString('en-IN')}</div>
          </div>
        </div>
      </div>

      {/* THREE PANELS: PARTICULARS & TRUST | DOCUMENTS | DISCREPANCIES */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Critical Fields with Trust Source Badges */}
        <div className="lg:col-span-2 bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-aicte-700" />
              Instrument Particulars & Field-Level Trust
            </h2>
            <span className="text-[11px] text-slate-400">Claimed vs Bank Verified</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/60 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-semibold">FDR Number</span>
                {renderTrustBadge('fdrNo')}
              </div>
              <div className="font-bold text-slate-800 text-sm">{fdr.fdrNo}</div>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/60 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-semibold">Bank Name</span>
                {renderTrustBadge('bank')}
              </div>
              <div className="font-bold text-slate-800 text-sm">{fdr.bank}</div>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/60 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-semibold">Branch & IFSC</span>
                {renderTrustBadge('ifsc')}
              </div>
              <div className="font-bold text-slate-800 text-sm">{fdr.branch} ({fdr.ifsc})</div>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/60 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-semibold">Principal Deposit Amount</span>
                {renderTrustBadge('amount')}
              </div>
              <div className="font-bold text-slate-800 text-sm">₹{Number(fdr.amount).toLocaleString('en-IN')}</div>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/60 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-semibold">Issue Date</span>
                {renderTrustBadge('issueDate')}
              </div>
              <div className="font-bold text-slate-800 text-sm">
                {new Date(fdr.issueDate).toLocaleDateString('en-IN')}
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/60 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-semibold">Maturity Date</span>
                {renderTrustBadge('maturityDate')}
              </div>
              <div className="font-bold text-slate-800 text-sm">
                {new Date(fdr.maturityDate).toLocaleDateString('en-IN')}
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/60 space-y-1 sm:col-span-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-semibold">Lien Marked to AICTE</span>
                {renderTrustBadge('lienMarked')}
              </div>
              <div className="font-bold text-slate-800 text-sm">
                {fdr.lienMarked ? 'YES — Lien marked in favour of Member Secretary, AICTE' : 'NO — Unencumbered (Lien Missing)'}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Encrypted Documents */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Lock className="w-4 h-4 text-emerald-600" />
              Encrypted Documents
            </h2>
            <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-bold">
              AES-256-GCM
            </span>
          </div>

          {fdr.documents?.length === 0 ? (
            <div className="text-xs text-slate-400 py-6 text-center">No documents uploaded.</div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
              {fdr.documents?.map((doc: any) => (
                <div key={doc.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold text-slate-800 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-slate-400" />
                      {doc.type} (v{doc.version})
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                      SHA: {doc.sha256.slice(0, 16)}...
                    </div>
                  </div>
                  <button
                    onClick={() => handleDownloadDoc(doc.id)}
                    title="Download securely via signed URL"
                    className="p-1.5 text-aicte-700 hover:bg-aicte-50 rounded transition"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* DISCREPANCIES SECTION */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Discrepancy Audit Findings
          </h2>
          <span className="text-xs text-slate-500">
            {fdr.discrepancies?.filter((d: any) => d.status === 'OPEN').length} Open Issues
          </span>
        </div>

        {fdr.discrepancies?.length === 0 ? (
          <div className="text-xs text-slate-400 py-4 text-center">No discrepancies identified for this FDR.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {fdr.discrepancies?.map((disc: any) => (
              <div key={disc.id} className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-1.5 py-0.5 rounded font-black text-[10px] border ${
                        disc.severity === 'HIGH'
                          ? 'bg-red-50 text-red-700 border-red-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}
                    >
                      {disc.code} • {disc.severity}
                    </span>
                    <span
                      className={`text-[10px] font-bold ${
                        disc.status === 'RESOLVED' ? 'text-emerald-600' : 'text-red-600'
                      }`}
                    >
                      [{disc.status}]
                    </span>
                  </div>
                  <p className="text-slate-700 font-medium">{disc.detail}</p>
                  {disc.remarks && (
                    <p className="text-[11px] text-slate-500 italic">Officer Remarks: {disc.remarks}</p>
                  )}
                </div>

                {disc.status === 'OPEN' && (user?.role === 'OFFICER' || user?.role === 'ADMIN') && (
                  <button
                    onClick={() =>
                      setResolveModal({
                        open: true,
                        discrepancyId: disc.id,
                        code: disc.code,
                        severity: disc.severity,
                        remarks: '',
                      })
                    }
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded text-xs transition"
                  >
                    Resolve Discrepancy
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* APPEND-ONLY EVENT TIMELINE */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <History className="w-4 h-4 text-indigo-600" />
            Append-Only Lifecycle History
          </h2>
          <span className="text-xs text-slate-400">Cryptographically Hash-Chained</span>
        </div>

        <div className="space-y-3">
          {fdr.events?.map((ev: any) => (
            <div key={ev.id} className="flex gap-3 text-xs">
              <div className="font-bold text-slate-400 w-28 shrink-0">
                {new Date(ev.ts).toLocaleString('en-IN', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
              <div className="border-l-2 border-indigo-200 pl-3 pb-1 space-y-0.5">
                <div className="font-bold text-slate-800">
                  <span className="text-slate-500">{ev.fromStatus}</span> ➔{' '}
                  <span className="text-indigo-700">{ev.toStatus}</span>
                </div>
                {ev.remarks && <p className="text-slate-600 text-[11px]">{ev.remarks}</p>}
                <div className="text-[10px] text-slate-400">
                  Actor: {ev.actor?.email} ({ev.actor?.role})
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* RESOLUTION MODAL */}
      {resolveModal.open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900">Resolve Discrepancy: {resolveModal.code}</h3>
            <p className="text-xs text-slate-600">
              {resolveModal.severity === 'HIGH' ? (
                <span className="text-red-600 font-bold">
                  Attention: Because this is a HIGH severity finding, official justification remarks are strictly mandatory.
                </span>
              ) : (
                'Provide officer remarks or documentation notes.'
              )}
            </p>
            <textarea
              required={resolveModal.severity === 'HIGH'}
              rows={3}
              value={resolveModal.remarks}
              onChange={(e) => setResolveModal({ ...resolveModal, remarks: e.target.value })}
              placeholder="e.g. Scrutinized original physical receipt; bank branch manager confirmed authenticity in person."
              className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-aicte-500"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setResolveModal({ open: false, remarks: '' })}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleResolveDiscrepancy}
                className="px-4 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded transition shadow"
              >
                Confirm Resolution
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
