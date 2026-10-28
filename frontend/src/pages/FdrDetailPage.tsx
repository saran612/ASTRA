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
  UserCheck,
  Upload,
  Sparkles,
  BookOpen,
} from 'lucide-react';
import { apiRequest, getCurrentUser } from '../api';

export function FdrDetailPage() {
  const { id } = useParams<{ id: string }>();
  const user = getCurrentUser();
  const [fdr, setFdr] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // AI Copilot States
  const [slaRisk, setSlaRisk] = useState<any>(null);
  const [slaRiskLoading, setSlaRiskLoading] = useState(false);
  const [ragQuery, setRagQuery] = useState('');
  const [ragResult, setRagResult] = useState<any>(null);
  const [ragLoading, setRagLoading] = useState(false);
  const [bankActionLoading, setBankActionLoading] = useState(false);
  const [resolveModal, setResolveModal] = useState<{ open: boolean; discrepancyId?: string; code?: string; severity?: string; remarks: string }>({
    open: false,
    remarks: '',
  });
  const [manualConfirmModal, setManualConfirmModal] = useState<{
    open: boolean;
    requestId: string;
    bankRemarks: string;
    file: File | null;
  }>({
    open: false,
    requestId: '',
    bankRemarks: '',
    file: null,
  });

  const isOfficerOrAdmin = ['OFFICER', 'REGIONAL_OFFICER', 'ADMIN', 'BUREAU'].includes(user?.role || '');
  const isAuthorityOrAdmin = ['AUTHORITY', 'BUREAU', 'ADMIN'].includes(user?.role || '');

  const [releaseActionLoading, setReleaseActionLoading] = useState(false);
  const [releaseReqModal, setReleaseReqModal] = useState({ open: false, reason: '' });
  const [officerApproveModal, setOfficerApproveModal] = useState({
    open: false,
    requestId: '',
    checklist: {
      courseClosureApproved: false,
      noPendingAuditQueries: false,
      noStudentGrievancePending: false,
      originalFdReceiptSurrendered: false,
      officerRecommendationSigned: false,
    },
    remarks: '',
  });
  const [rejectReleaseModal, setRejectReleaseModal] = useState({
    open: false,
    requestId: '',
    reason: '',
  });

  const loadSlaRisk = async (fdrData: any) => {
    setSlaRiskLoading(true);
    try {
      const now = new Date().getTime();
      const maturity = new Date(fdrData.maturityDate).getTime();
      const daysRemaining = Math.max(0, Math.round((maturity - now) / (1000 * 60 * 60 * 24)));
      const created = new Date(fdrData.createdAt).getTime();
      const daysInScrutiny = Math.max(1, Math.round((now - created) / (1000 * 60 * 60 * 24)));
      const revertCount = fdrData.history?.filter((h: any) => h.toState?.includes('REVERT') || h.action?.includes('REVERT')).length || 0;
      const discrepancyCount = fdrData.discrepancies?.filter((d: any) => d.status === 'OPEN').length || 0;

      const risk = await apiRequest('/api/ai/risk', {
        method: 'POST',
        body: JSON.stringify({
          daysRemaining,
          revertCount,
          discrepancyCount,
          daysInScrutiny,
          amount: Number(fdrData.amount),
        }),
      });
      setSlaRisk(risk);
    } catch {
      setSlaRisk({
        riskCategory: 'UNKNOWN',
        slaRiskScore: 0.0,
        topRiskFactors: ['AI risk model offline'],
        disclaimer: 'Synthetic training data, demo only (Offline Fallback)',
        isOfflineFallback: true,
      });
    } finally {
      setSlaRiskLoading(false);
    }
  };

  const handleHandbookQuery = async (queryText: string) => {
    if (!queryText.trim()) return;
    setRagLoading(true);
    try {
      const res = await apiRequest('/api/ai/rag', {
        method: 'POST',
        body: JSON.stringify({ query: queryText }),
      });
      setRagResult(res);
    } catch {
      setRagResult({
        found: false,
        answer: 'AI assistance unavailable; consult physical Approval Process Handbook. Manual verification required.',
        isOfflineFallback: true,
      });
    } finally {
      setRagLoading(false);
    }
  };

  const loadFdr = async () => {
    try {
      const data = await apiRequest(`/api/fdrs/${id}`);
      setFdr(data);
      loadSlaRisk(data);
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

  // Download Bank Inquiry Letter
  const handleDownloadInquiryLetter = async (requestId: string) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/bank-verification/${requestId}/template`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to generate letter');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Bank-Inquiry-Letter-${fdr.fdrNo}.txt`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(`Download failed: ${e.message}`);
    }
  };

  // Initiate bank verification request
  const handleRequestBankVerification = async (isMock: boolean) => {
    setBankActionLoading(true);
    try {
      const res = await apiRequest(`/api/bank-verification/request/${fdr.id}${isMock ? '?mock=true' : ''}`, {
        method: 'POST',
      });
      if (isMock) {
        await apiRequest(`/api/bank-verification/${res.requestId}/mock-confirm`, {
          method: 'POST',
        });
      }
      await loadFdr();
    } catch (e: any) {
      alert(`Bank verification request failed: ${e.message}`);
    } finally {
      setBankActionLoading(false);
    }
  };

  // Submit manual bank response confirmation
  const handleManualBankConfirm = async () => {
    if (!manualConfirmModal.requestId) return;
    setBankActionLoading(true);
    try {
      const formData = new FormData();
      if (manualConfirmModal.file) {
        formData.append('replyDocument', manualConfirmModal.file);
      }
      formData.append('bankRemarks', manualConfirmModal.bankRemarks || 'Confirmed in order by branch manager');

      const token = localStorage.getItem('token');
      const res = await fetch(`/api/bank-verification/${manualConfirmModal.requestId}/manual-confirm`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to record confirmation');
      }
      setManualConfirmModal({ open: false, requestId: '', bankRemarks: '', file: null });
      await loadFdr();
    } catch (e: any) {
      alert(`Manual confirmation failed: ${e.message}`);
    } finally {
      setBankActionLoading(false);
    }
  };

  // Release Action Handlers
  const handleInitiateRelease = async () => {
    if (!releaseReqModal.reason) return;
    setReleaseActionLoading(true);
    try {
      await apiRequest(`/api/release/fdrs/${fdr.id}/request`, {
        method: 'POST',
        body: JSON.stringify({ reason: releaseReqModal.reason }),
      });
      setReleaseReqModal({ open: false, reason: '' });
      await loadFdr();
    } catch (e: any) {
      alert(`Release request failed: ${e.message}`);
    } finally {
      setReleaseActionLoading(false);
    }
  };

  const handleOfficerApproveRelease = async () => {
    setReleaseActionLoading(true);
    try {
      await apiRequest(`/api/release/requests/${officerApproveModal.requestId}/officer-approve`, {
        method: 'POST',
        body: JSON.stringify({
          checklist: officerApproveModal.checklist,
          remarks: officerApproveModal.remarks,
        }),
      });
      setOfficerApproveModal({
        open: false,
        requestId: '',
        checklist: {
          courseClosureApproved: false,
          noPendingAuditQueries: false,
          noStudentGrievancePending: false,
          originalFdReceiptSurrendered: false,
          officerRecommendationSigned: false,
        },
        remarks: '',
      });
      await loadFdr();
    } catch (e: any) {
      alert(`Officer sign-off failed: ${e.message}`);
    } finally {
      setReleaseActionLoading(false);
    }
  };

  const handleAuthorityApproveRelease = async (requestId: string) => {
    if (!confirm('Confirm final release authorization for this FDR? (Note: System records authorizations only; does not disburse funds)')) return;
    setReleaseActionLoading(true);
    try {
      await apiRequest(`/api/release/requests/${requestId}/authority-approve`, {
        method: 'POST',
        body: JSON.stringify({ remarks: 'Final approval granted by Competent Authority' }),
      });
      await loadFdr();
    } catch (e: any) {
      alert(`Authority approval failed: ${e.message}`);
    } finally {
      setReleaseActionLoading(false);
    }
  };

  const handleRejectRelease = async () => {
    if (!rejectReleaseModal.reason) return;
    setReleaseActionLoading(true);
    try {
      await apiRequest(`/api/release/requests/${rejectReleaseModal.requestId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ rejectionReason: rejectReleaseModal.reason }),
      });
      setRejectReleaseModal({ open: false, requestId: '', reason: '' });
      await loadFdr();
    } catch (e: any) {
      alert(`Rejection failed: ${e.message}`);
    } finally {
      setReleaseActionLoading(false);
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

    if (trust.source === 'OFFICER_ENTERED') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-bold bg-blue-100 text-blue-800 border border-blue-300">
          <UserCheck className="w-3 h-3 text-blue-700" />
          OFFICER_ENTERED
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

      {/* AI COMPLIANCE COPILOT & SLA RISK PREDICTOR */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              AI Compliance Copilot (SLA Breach Risk & Handbook Assistant)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Assists scrutiny officers with synthetic SLA risk forecasting and zero-hallucination handbook citations.
            </p>
          </div>
          {slaRisk && (
            <span
              className={`text-xs px-2.5 py-1 rounded font-black self-start sm:self-auto border ${
                slaRisk.riskCategory === 'CRITICAL'
                  ? 'bg-red-100 text-red-800 border-red-300'
                  : slaRisk.riskCategory === 'HIGH'
                  ? 'bg-orange-100 text-orange-800 border-orange-300'
                  : slaRisk.riskCategory === 'MEDIUM'
                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                  : slaRisk.riskCategory === 'LOW'
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                  : 'bg-slate-100 text-slate-700 border-slate-300'
              }`}
            >
              SLA Risk: {slaRisk.riskCategory} ({Math.round((slaRisk.slaRiskScore || 0) * 100)}%)
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* Left: SLA Breach Risk Breakdown */}
          <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200/70 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                SLA Breach Risk Factor Breakdown
              </span>
              <span className="text-[10px] text-slate-400 font-mono italic">
                {slaRisk?.disclaimer || 'Synthetic training data, demo only'}
              </span>
            </div>

            {slaRiskLoading ? (
              <div className="text-slate-400 text-xs py-3">Evaluating procedural signals...</div>
            ) : slaRisk?.isOfflineFallback ? (
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded text-amber-800 text-[11px]">
                AI risk model offline; monitoring using standard deadline timers.
              </div>
            ) : (
              <div className="space-y-1.5">
                {slaRisk?.topRiskFactors?.map((factor: string, idx: number) => (
                  <div key={idx} className="flex items-start gap-1.5 text-[11px] text-slate-700">
                    <span className="text-indigo-600 font-bold">•</span>
                    <span>{factor}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Zero-Hallucination Handbook Assistant */}
          <div className="p-3.5 bg-indigo-50/50 rounded-lg border border-indigo-100 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-indigo-900 flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-indigo-700" />
                Handbook RAG Assistant (APH 2024-27)
              </span>
              <span className="text-[10px] text-indigo-600 font-medium">Strict Citations</span>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={ragQuery}
                onChange={(e) => setRagQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleHandbookQuery(ragQuery)}
                placeholder="Ask handbook question (e.g., tenure, release checklist)..."
                className="w-full px-2.5 py-1.5 bg-white border border-indigo-200 rounded text-xs focus:ring-2 focus:ring-indigo-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => handleHandbookQuery(ragQuery)}
                disabled={ragLoading || !ragQuery.trim()}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded shadow-sm text-xs transition disabled:opacity-50 shrink-0"
              >
                {ragLoading ? 'Querying...' : 'Ask'}
              </button>
            </div>

            {/* Quick Prompt Chips */}
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setRagQuery('lock-in tenure for new institutions');
                  handleHandbookQuery('lock-in tenure for new institutions');
                }}
                className="text-[10px] bg-white border border-indigo-200 text-indigo-700 px-2 py-0.5 rounded hover:bg-indigo-100 transition"
              >
                Tenure Period?
              </button>
              <button
                type="button"
                onClick={() => {
                  setRagQuery('refund and release 5-point checklist');
                  handleHandbookQuery('refund and release 5-point checklist');
                }}
                className="text-[10px] bg-white border border-indigo-200 text-indigo-700 px-2 py-0.5 rounded hover:bg-indigo-100 transition"
              >
                Release Checklist?
              </button>
              <button
                type="button"
                onClick={() => {
                  setRagQuery('joint lien marking bank books');
                  handleHandbookQuery('joint lien marking bank books');
                }}
                className="text-[10px] bg-white border border-indigo-200 text-indigo-700 px-2 py-0.5 rounded hover:bg-indigo-100 transition"
              >
                Lien Rules?
              </button>
            </div>

            {/* RAG Answer Display */}
            {ragResult && (
              <div
                className={`p-2.5 rounded border text-[11px] leading-relaxed ${
                  ragResult.found
                    ? 'bg-white border-indigo-200 text-slate-800'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}
              >
                {ragResult.found && (
                  <div className="font-bold text-indigo-900 mb-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-indigo-600" />
                    {ragResult.clause_id} ({ragResult.title})
                  </div>
                )}
                <div>{ragResult.answer}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* BANK VERIFICATION & TRUST LEDGER PROMOTION */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-aicte-700" />
              Bank Verification & Trust Ledger Promotion
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Promotion from <span className="font-semibold text-amber-700">CLAIMED</span> to{' '}
              <span className="font-semibold text-teal-700">BANK_CONFIRMED</span> requires verified bank response.
            </p>
          </div>
          {fdr.bankRequests && fdr.bankRequests.length > 0 && (
            <span
              className={`text-xs px-2.5 py-1 rounded font-black self-start sm:self-auto ${
                fdr.bankRequests[0].status === 'CONFIRMED'
                  ? 'bg-teal-100 text-teal-800 border border-teal-300'
                  : 'bg-amber-100 text-amber-800 border border-amber-300'
              }`}
            >
              Latest Request: {fdr.bankRequests[0].status}
            </span>
          )}
        </div>

        {/* Existing bank requests list */}
        {fdr.bankRequests && fdr.bankRequests.length > 0 ? (
          <div className="space-y-3">
            {fdr.bankRequests.map((req: any) => (
              <div
                key={req.id}
                className="p-3 bg-slate-50 rounded-lg border border-slate-200/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800">Request #{req.id.slice(0, 8)}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-mono">
                      Sent: {new Date(req.sentAt).toLocaleDateString('en-IN')}
                    </span>
                    {req.respondedAt && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-mono">
                        Responded: {new Date(req.respondedAt).toLocaleDateString('en-IN')}
                      </span>
                    )}
                  </div>
                  {req.meta?.bankRemarks && (
                    <div className="text-slate-600 italic text-[11px]">
                      Bank Remarks: {req.meta.bankRemarks}
                    </div>
                  )}
                  {req.meta?.mode && (
                    <div className="text-[10px] text-slate-400">
                      Mode: {req.meta.mode} {req.meta.mode === 'MOCK_AUTOMATED' && '[DEMO MOCK]'}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDownloadInquiryLetter(req.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-100 rounded text-slate-700 transition"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-500" />
                    Inquiry Letter
                  </button>

                  {req.status === 'PENDING' && isOfficerOrAdmin && (
                    <button
                      onClick={() =>
                        setManualConfirmModal({
                          open: true,
                          requestId: req.id,
                          bankRemarks: '',
                          file: null,
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white rounded transition shadow"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Record Response
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-slate-400 py-2">
            No bank verification inquiry has been initiated yet for this FDR.
          </div>
        )}

        {/* Action buttons for Officers / Admins */}
        {isOfficerOrAdmin && (
          <div className="pt-2 flex flex-wrap items-center gap-3">
            <button
              disabled={bankActionLoading}
              onClick={() => handleRequestBankVerification(false)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold bg-aicte-700 hover:bg-aicte-800 text-white rounded-lg transition shadow disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              Initiate Manual Bank Inquiry
            </button>

            <button
              disabled={bankActionLoading}
              onClick={() => handleRequestBankVerification(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition shadow disabled:opacity-50"
              title="One-click simulation for evaluation and demonstration"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Simulate Bank Confirmation [DEMO MOCK]
            </button>
          </div>
        )}
      </div>

      {/* RELEASE & REFUND CLEARANCE LEDGER */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-purple-700" />
              Two-Tier Release & Refund Clearance
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Statutory 2-tier approval workflow (Regional Scrutiny Checklist ➔ Bureau Authority Clearance).
            </p>
          </div>
          <div className="text-[11px] font-semibold text-slate-500 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded">
            Disclaimer: FDR Vault records authorizations only; does not disburse funds.
          </div>
        </div>

        {/* Current status display */}
        {fdr.status === 'RELEASED' ? (
          <div className="p-4 bg-purple-50 rounded-lg border border-purple-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="text-sm font-black text-purple-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-purple-700" />
                FDR RELEASE AUTHORIZED
              </div>
              <p className="text-xs text-purple-700 font-medium">
                Both Regional Officer checklist verification and Competent Authority authorizations have been executed and logged into the cryptographic ledger.
              </p>
            </div>
            <div className="px-3 py-1 bg-purple-800 text-white rounded text-xs font-black tracking-wider uppercase text-center shrink-0">
              Authorized
            </div>
          </div>
        ) : fdr.releaseRequests && fdr.releaseRequests.length > 0 ? (
          <div className="space-y-3">
            {fdr.releaseRequests.map((req: any) => (
              <div
                key={req.id}
                className="p-3 bg-slate-50 rounded-lg border border-slate-200/70 space-y-2 text-xs"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="font-bold text-slate-800 flex items-center gap-2">
                      <span>Release Request #{req.id.slice(0, 8)}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                        req.status === 'APPROVED'
                          ? 'bg-purple-100 text-purple-800'
                          : req.status === 'REJECTED'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        [{req.status}]
                      </span>
                    </div>
                    <div className="text-slate-600">Reason: {req.reason}</div>
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {new Date(req.ts).toLocaleDateString('en-IN')}
                  </div>
                </div>

                {req.officerRemarks && (
                  <div className="text-[11px] text-slate-500 bg-white p-2 rounded border border-slate-200">
                    <span className="font-semibold text-slate-700">Officer Remarks:</span> {req.officerRemarks}
                  </div>
                )}
                {req.authorityRemarks && (
                  <div className="text-[11px] text-slate-500 bg-white p-2 rounded border border-slate-200">
                    <span className="font-semibold text-slate-700">Authority Remarks:</span> {req.authorityRemarks}
                  </div>
                )}

                {/* Actions on this pending request */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {req.status === 'PENDING_OFFICER' && isOfficerOrAdmin && (
                    <>
                      <button
                        onClick={() =>
                          setOfficerApproveModal({
                            open: true,
                            requestId: req.id,
                            checklist: {
                              courseClosureApproved: false,
                              noPendingAuditQueries: false,
                              noStudentGrievancePending: false,
                              originalFdReceiptSurrendered: false,
                              officerRecommendationSigned: false,
                            },
                            remarks: '',
                          })
                        }
                        className="px-3 py-1.5 text-xs font-bold bg-purple-700 hover:bg-purple-800 text-white rounded transition shadow"
                      >
                        Complete Checklist & Recommend
                      </button>
                      <button
                        onClick={() =>
                          setRejectReleaseModal({
                            open: true,
                            requestId: req.id,
                            reason: '',
                          })
                        }
                        className="px-3 py-1.5 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded transition shadow"
                      >
                        Reject Request
                      </button>
                    </>
                  )}

                  {req.status === 'PENDING_AUTHORITY' && isAuthorityOrAdmin && (
                    <>
                      <button
                        disabled={releaseActionLoading}
                        onClick={() => handleAuthorityApproveRelease(req.id)}
                        className="px-3 py-1.5 text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white rounded transition shadow disabled:opacity-50"
                      >
                        Grant Final Release Authorization
                      </button>
                      <button
                        onClick={() =>
                          setRejectReleaseModal({
                            open: true,
                            requestId: req.id,
                            reason: '',
                          })
                        }
                        className="px-3 py-1.5 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded transition shadow"
                      >
                        Reject Request
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-slate-400 py-2">
            No release or refund clearance has been requested for this FDR.
          </div>
        )}

        {/* Institution can initiate release if active/expiring/renewed */}
        {['ACTIVE', 'EXPIRING', 'RENEWED'].includes(fdr.status) && (
          <div className="pt-2">
            <button
              onClick={() => setReleaseReqModal({ open: true, reason: '' })}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold bg-purple-700 hover:bg-purple-800 text-white rounded-lg transition shadow"
            >
              <Send className="w-3.5 h-3.5" />
              Request Release / Refund of Security Deposit
            </button>
          </div>
        )}
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
      {/* MANUAL CONFIRM MODAL */}
      {manualConfirmModal.open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900">Record Bank Confirmation Response</h3>
            <p className="text-xs text-slate-600">
              Attach the signed physical/scanned confirmation letter received from the issuing bank manager. All critical instrument fields will be promoted to{' '}
              <span className="font-bold text-teal-700">BANK_CONFIRMED</span>.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Bank Response Document (PDF)
                </label>
                <input
                  type="file"
                  accept=".pdf,image/*"
                  onChange={(e) =>
                    setManualConfirmModal({
                      ...manualConfirmModal,
                      file: e.target.files ? e.target.files[0] : null,
                    })
                  }
                  className="w-full text-xs text-slate-600 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Branch Manager Remarks / Reference
                </label>
                <textarea
                  rows={3}
                  value={manualConfirmModal.bankRemarks}
                  onChange={(e) =>
                    setManualConfirmModal({ ...manualConfirmModal, bankRemarks: e.target.value })
                  }
                  placeholder="e.g. Confirmed genuine instrument, lien marked in favour of AICTE in bank records."
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={bankActionLoading}
                onClick={() =>
                  setManualConfirmModal({ open: false, requestId: '', bankRemarks: '', file: null })
                }
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={bankActionLoading}
                onClick={handleManualBankConfirm}
                className="px-4 py-1.5 text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white rounded transition shadow disabled:opacity-50"
              >
                {bankActionLoading ? 'Recording...' : 'Confirm & Promote Trust'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* RELEASE REQUEST MODAL */}
      {releaseReqModal.open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900">Initiate FDR Release / Refund Request</h3>
            <p className="text-xs text-slate-600">
              Provide formal regulatory justification for release (e.g., permanent closure of institution, substitution with approved bank guarantee, or completion of mandatory lock-in period).
            </p>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Reason / Justification Notes
              </label>
              <textarea
                required
                rows={3}
                value={releaseReqModal.reason}
                onChange={(e) => setReleaseReqModal({ ...releaseReqModal, reason: e.target.value })}
                placeholder="e.g. Permanent closure of technical courses approved by AICTE Executive Committee."
                className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={releaseActionLoading}
                onClick={() => setReleaseReqModal({ open: false, reason: '' })}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={releaseActionLoading}
                onClick={handleInitiateRelease}
                className="px-4 py-1.5 text-xs font-bold bg-purple-700 hover:bg-purple-800 text-white rounded transition shadow disabled:opacity-50"
              >
                {releaseActionLoading ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OFFICER CHECKLIST APPROVAL MODAL */}
      {officerApproveModal.open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 space-y-4 shadow-xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900">Officer Regulatory Checklist Clearance</h3>
            <p className="text-xs text-slate-600">
              All 5 statutory conditions must be verified and checked before passing this recommendation to the Competent Authority.
            </p>
            <div className="space-y-2 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={officerApproveModal.checklist.courseClosureApproved}
                  onChange={(e) =>
                    setOfficerApproveModal({
                      ...officerApproveModal,
                      checklist: { ...officerApproveModal.checklist, courseClosureApproved: e.target.checked },
                    })
                  }
                  className="rounded text-purple-600 focus:ring-purple-500"
                />
                <span className="font-semibold text-slate-700">Course / Institution closure formally approved</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={officerApproveModal.checklist.noPendingAuditQueries}
                  onChange={(e) =>
                    setOfficerApproveModal({
                      ...officerApproveModal,
                      checklist: { ...officerApproveModal.checklist, noPendingAuditQueries: e.target.checked },
                    })
                  }
                  className="rounded text-purple-600 focus:ring-purple-500"
                />
                <span className="font-semibold text-slate-700">No pending CAG / Bureau audit queries</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={officerApproveModal.checklist.noStudentGrievancePending}
                  onChange={(e) =>
                    setOfficerApproveModal({
                      ...officerApproveModal,
                      checklist: { ...officerApproveModal.checklist, noStudentGrievancePending: e.target.checked },
                    })
                  }
                  className="rounded text-purple-600 focus:ring-purple-500"
                />
                <span className="font-semibold text-slate-700">No student grievance / fee refund dispute pending</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={officerApproveModal.checklist.originalFdReceiptSurrendered}
                  onChange={(e) =>
                    setOfficerApproveModal({
                      ...officerApproveModal,
                      checklist: { ...officerApproveModal.checklist, originalFdReceiptSurrendered: e.target.checked },
                    })
                  }
                  className="rounded text-purple-600 focus:ring-purple-500"
                />
                <span className="font-semibold text-slate-700">Original FDR physical receipt surrendered / verified</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={officerApproveModal.checklist.officerRecommendationSigned}
                  onChange={(e) =>
                    setOfficerApproveModal({
                      ...officerApproveModal,
                      checklist: { ...officerApproveModal.checklist, officerRecommendationSigned: e.target.checked },
                    })
                  }
                  className="rounded text-purple-600 focus:ring-purple-500"
                />
                <span className="font-semibold text-slate-700">Regional Officer recommendation signed & endorsed</span>
              </label>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Scrutiny Officer Remarks
              </label>
              <textarea
                rows={2}
                value={officerApproveModal.remarks}
                onChange={(e) => setOfficerApproveModal({ ...officerApproveModal, remarks: e.target.value })}
                placeholder="e.g. Scrutinized records in order. Recommended for refund clearance."
                className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={releaseActionLoading}
                onClick={() => setOfficerApproveModal({ ...officerApproveModal, open: false })}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={releaseActionLoading}
                onClick={handleOfficerApproveRelease}
                className="px-4 py-1.5 text-xs font-bold bg-purple-700 hover:bg-purple-800 text-white rounded transition shadow disabled:opacity-50"
              >
                {releaseActionLoading ? 'Endorsing...' : 'Endorse & Pass to Authority'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REJECT RELEASE MODAL */}
      {rejectReleaseModal.open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900">Reject Release Request</h3>
            <p className="text-xs text-slate-600">
              Enter mandatory rejection reason. The FDR will be restored to <span className="font-bold text-emerald-700">ACTIVE</span> status.
            </p>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Rejection Grounds
              </label>
              <textarea
                required
                rows={3}
                value={rejectReleaseModal.reason}
                onChange={(e) => setRejectReleaseModal({ ...rejectReleaseModal, reason: e.target.value })}
                placeholder="e.g. Pending student refund dispute reported to Regional Office."
                className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={releaseActionLoading}
                onClick={() => setRejectReleaseModal({ open: false, requestId: '', reason: '' })}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={releaseActionLoading}
                onClick={handleRejectRelease}
                className="px-4 py-1.5 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded transition shadow disabled:opacity-50"
              >
                {releaseActionLoading ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
