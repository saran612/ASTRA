import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileCheck2, Send, Download, CheckCircle2, ShieldAlert } from 'lucide-react';
import { apiRequest } from '../api';

export function OfficerQueuePage() {
  const [fdrs, setFdrs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadQueue = async () => {
    try {
      const data = await apiRequest('/api/fdrs?status=UNDER_SCRUTINY');
      setFdrs(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();
  }, []);

  const handleRequestVerification = async (fdrId: string) => {
    try {
      const res = await apiRequest(`/api/bank-verification/request/${fdrId}`, {
        method: 'POST',
      });
      alert(`Bank Verification Request Created (ID: ${res.requestId})`);
      window.open(`/api/bank-verification/${res.requestId}/template`, '_blank');
      await loadQueue();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleMockConfirm = async (fdrId: string) => {
    try {
      // 1. Request verification in mock mode
      const reqRes = await apiRequest(`/api/bank-verification/request/${fdrId}?mock=true`, {
        method: 'POST',
      });
      // 2. Trigger mock confirm
      await apiRequest(`/api/bank-verification/${reqRes.requestId}/mock-confirm`, {
        method: 'POST',
      });
      alert('Mock bank confirmation recorded! Field trust updated to BANK_CONFIRMED.');
      await loadQueue();
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-black text-slate-900 tracking-tight">Officer Scrutiny Queue</h1>
        <p className="text-xs text-slate-500">
          Review pending FDR deposits, issue formal bank verification inquiries, or perform demo verifications
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading scrutiny inbox...</div>
        ) : fdrs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">No FDRs currently awaiting scrutiny.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                  <th className="py-3 px-4">FDR Number</th>
                  <th className="py-3 px-4">Institution</th>
                  <th className="py-3 px-4">Bank</th>
                  <th className="py-3 px-4">Deposit Amount</th>
                  <th className="py-3 px-4">Discrepancies</th>
                  <th className="py-3 px-4 text-right">Verification Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {fdrs.map((fdr) => (
                  <tr key={fdr.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-bold text-slate-900">
                      <Link to={`/fdrs/${fdr.id}`} className="text-aicte-700 hover:underline">
                        {fdr.fdrNo}
                      </Link>
                    </td>
                    <td className="py-3 px-4 text-slate-700">{fdr.institution?.name}</td>
                    <td className="py-3 px-4 text-slate-700">{fdr.bank}</td>
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      ₹{Number(fdr.amount).toLocaleString('en-IN')}
                    </td>
                    <td className="py-3 px-4">
                      {fdr.discrepancies?.length > 0 ? (
                        <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded">
                          {fdr.discrepancies.length} Open Issues
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                          Clean
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right space-x-2">
                      <button
                        onClick={() => handleRequestVerification(fdr.id)}
                        className="px-2.5 py-1 text-[11px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition inline-flex items-center gap-1"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Formal Bank Letter
                      </button>

                      <button
                        onClick={() => handleMockConfirm(fdr.id)}
                        className="px-2.5 py-1 text-[11px] font-bold text-white bg-teal-600 hover:bg-teal-700 rounded transition shadow-sm inline-flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Mock Bank Confirm [DEMO]
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
