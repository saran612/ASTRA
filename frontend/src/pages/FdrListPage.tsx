import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Download, Filter, FileText, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { apiRequest } from '../api';

export function FdrListPage() {
  const [fdrs, setFdrs] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadFdrs() {
      try {
        const queryParams = new URLSearchParams();
        if (statusFilter) queryParams.set('status', statusFilter);
        if (search) queryParams.set('search', search);

        const data = await apiRequest(`/api/fdrs?${queryParams.toString()}`);
        setFdrs(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadFdrs();
  }, [statusFilter, search]);

  const handleExportCsv = () => {
    if (fdrs.length === 0) return;
    const headers = ['FDR No', 'Institution', 'Bank', 'Branch', 'IFSC', 'Amount', 'Issue Date', 'Maturity Date', 'Status', 'Lien Marked'];
    const rows = fdrs.map((f) => [
      f.fdrNo,
      `"${f.institution?.name || ''}"`,
      `"${f.bank}"`,
      `"${f.branch}"`,
      f.ifsc,
      f.amount,
      f.issueDate.slice(0, 10),
      f.maturityDate.slice(0, 10),
      f.status,
      f.lienMarked ? 'YES' : 'NO',
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `AICTE_FDR_EXPORT_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const statusColors: Record<string, string> = {
    SUBMITTED: 'bg-slate-100 text-slate-700 border-slate-300',
    UNDER_SCRUTINY: 'bg-blue-50 text-blue-700 border-blue-300',
    DISCREPANCY: 'bg-red-50 text-red-700 border-red-300',
    VERIFIED: 'bg-teal-50 text-teal-700 border-teal-300',
    ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-300',
    EXPIRING: 'bg-amber-50 text-amber-700 border-amber-300',
    RENEWED: 'bg-indigo-50 text-indigo-700 border-indigo-300',
    LAPSED: 'bg-rose-50 text-rose-700 border-rose-300',
    RELEASE_REQUESTED: 'bg-purple-50 text-purple-700 border-purple-300',
    RELEASE_APPROVED: 'bg-violet-50 text-violet-700 border-violet-300',
    RELEASED: 'bg-gray-100 text-gray-700 border-gray-300',
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight">FDR Central Repository</h1>
          <p className="text-xs text-slate-500">Official registry of pledged security deposits, guarantees, and FDRs</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-lg shadow-sm transition"
          >
            <Download className="w-4 h-4 text-slate-500" />
            Export CSV
          </button>
          <Link
            to="/fdrs/new"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-aicte-700 hover:bg-aicte-800 text-white font-bold text-xs rounded-lg shadow transition"
          >
            <FileText className="w-4 h-4" />
            Submit FDR
          </Link>
        </div>
      </div>

      {/* SEARCH AND FILTERS */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by FDR No, Bank, IFSC, or Institution..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-aicte-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-aicte-500 bg-white"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="EXPIRING">EXPIRING (T-90)</option>
            <option value="LAPSED">LAPSED / OVERDUE</option>
            <option value="RENEWED">RENEWED</option>
            <option value="UNDER_SCRUTINY">UNDER SCRUTINY</option>
            <option value="DISCREPANCY">DISCREPANCY</option>
            <option value="VERIFIED">VERIFIED</option>
            <option value="RELEASE_REQUESTED">RELEASE REQUESTED</option>
            <option value="RELEASED">RELEASED</option>
          </select>
        </div>
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading records...</div>
        ) : fdrs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">No FDR records match the specified filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                  <th className="py-3 px-4">FDR Number</th>
                  <th className="py-3 px-4">Institution</th>
                  <th className="py-3 px-4">Bank & Branch</th>
                  <th className="py-3 px-4">Amount (INR)</th>
                  <th className="py-3 px-4">Maturity Date</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Trust Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {fdrs.map((fdr) => {
                  const hasBankConfirmed = fdr.fieldTrusts?.some(
                    (t: any) => t.source === 'BANK_CONFIRMED'
                  );
                  return (
                    <tr key={fdr.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4 font-bold text-slate-900">
                        <Link to={`/fdrs/${fdr.id}`} className="text-aicte-700 hover:underline">
                          {fdr.fdrNo}
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        <div className="font-semibold">{fdr.institution?.name}</div>
                        <div className="text-[10px] text-slate-400">{fdr.institution?.aicteId}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        <div>{fdr.bank}</div>
                        <div className="text-[10px] text-slate-400">{fdr.ifsc} • {fdr.branch}</div>
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        ₹{Number(fdr.amount).toLocaleString('en-IN')}
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        {new Date(fdr.maturityDate).toLocaleDateString('en-IN')}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded border text-[10px] font-bold ${
                            statusColors[fdr.status] || 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {fdr.status}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {hasBankConfirmed ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                            <ShieldCheck className="w-3 h-3 text-teal-600" />
                            BANK_CONFIRMED
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            CLAIMED (INSTITUTION)
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Link
                          to={`/fdrs/${fdr.id}`}
                          className="px-2.5 py-1 text-[11px] font-bold text-aicte-700 hover:bg-aicte-50 rounded transition"
                        >
                          View Details
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
