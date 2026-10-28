import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Upload, AlertCircle, Sparkles, CheckCircle2, AlertTriangle } from 'lucide-react';
import { apiRequest } from '../api';

export function NewFdrPage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    fdrNo: '',
    bank: 'State Bank of India',
    branch: '',
    ifsc: '',
    amount: '',
    issueDate: '',
    maturityDate: '',
    lienMarked: false,
  });
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AI OCR States
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrResult, setOcrResult] = useState<any>(null);
  const [ocrText, setOcrText] = useState('');
  const [showOcrBox, setShowOcrBox] = useState(false);

  const handleRunOcr = async (textToExtract: string) => {
    if (!textToExtract.trim()) return;
    setOcrLoading(true);
    try {
      const res = await apiRequest('/api/ai/ocr', {
        method: 'POST',
        body: JSON.stringify({ textContent: textToExtract }),
      });
      setOcrResult(res);

      if (res.fields) {
        setFormData((prev) => ({
          ...prev,
          fdrNo: res.fields.fdrNo || prev.fdrNo,
          bank: res.fields.bank || prev.bank,
          branch: res.fields.branch || prev.branch,
          ifsc: res.fields.ifsc || prev.ifsc,
          amount: res.fields.amount ? String(res.fields.amount) : prev.amount,
          issueDate: res.fields.issueDate || prev.issueDate,
          maturityDate: res.fields.maturityDate || prev.maturityDate,
          lienMarked: res.fields.lienMarked ?? prev.lienMarked,
        }));
      }
    } catch (err: any) {
      setOcrResult({
        isOfflineFallback: true,
        notice: 'AI assistance unavailable; manual scrutiny required',
      });
    } finally {
      setOcrLoading(false);
    }
  };

  const handleLoadSampleReceipt = () => {
    const sample = `STATE BANK OF INDIA\nTERM DEPOSIT RECEIPT NO: SBIN-2026-88123\nBRANCH: PARLIAMENT STREET NEW DELHI\nIFSC: SBIN0000691\nPRINCIPAL AMOUNT: RS. 15,00,000.00\nDATE OF ISSUE: 2026-03-01\nDATE OF MATURITY: 2029-03-01\nPLEDGED / JOINT LIEN MARKED IN FAVOUR OF MEMBER SECRETARY, AICTE, NEW DELHI`;
    setOcrText(sample);
    setShowOcrBox(true);
    handleRunOcr(sample);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const data = new FormData();
      data.append('fdrNo', formData.fdrNo);
      data.append('bank', formData.bank);
      data.append('branch', formData.branch);
      data.append('ifsc', formData.ifsc);
      data.append('amount', formData.amount);
      data.append('issueDate', formData.issueDate);
      data.append('maturityDate', formData.maturityDate);
      data.append('lienMarked', String(formData.lienMarked));
      if (file) {
        data.append('document', file);
      }

      const res = await apiRequest('/api/fdrs', {
        method: 'POST',
        body: data,
      });

      // Run automatic discrepancy scan on newly submitted FDR
      await apiRequest(`/api/discrepancies/scan/${res.id}`, { method: 'POST' });

      navigate(`/fdrs/${res.id}`);
    } catch (err: any) {
      setError(err.message || 'Submission failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight">Submit Fixed Deposit Receipt</h1>
          <p className="text-xs text-slate-500">
            Enter deposit particulars as issued by the commercial bank. The automated discrepancy engine will evaluate validity upon submission.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowOcrBox(!showOcrBox)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-bold transition self-start"
        >
          <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
          {showOcrBox ? 'Hide AI OCR Assist' : 'AI OCR Auto-Fill'}
        </button>
      </div>

      {/* AI OCR Assist Panel */}
      {showOcrBox && (
        <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-4 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-indigo-900 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              AI OCR Instrument Extractor (Prototype Assist)
            </span>
            <button
              type="button"
              onClick={handleLoadSampleReceipt}
              className="text-[11px] text-indigo-700 underline font-semibold hover:text-indigo-900"
            >
              Paste Demo SBI Receipt Text
            </button>
          </div>

          <p className="text-[11px] text-indigo-700 leading-relaxed">
            Extract deposit metadata from receipt scan text. Fields with confidence &lt; 85% are automatically flagged for officer scrutiny.
          </p>

          <textarea
            value={ocrText}
            onChange={(e) => setOcrText(e.target.value)}
            rows={3}
            placeholder="Paste text from OCR scanner or deposit receipt PDF..."
            className="w-full p-2 border border-indigo-200 rounded-lg text-xs font-mono focus:ring-2 focus:ring-indigo-400 focus:outline-none bg-white"
          />

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => handleRunOcr(ocrText)}
              disabled={ocrLoading || !ocrText.trim()}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-md shadow-sm transition disabled:opacity-50"
            >
              {ocrLoading ? 'Extracting via AI...' : 'Auto-Fill Form Fields'}
            </button>

            {ocrResult?.isOfflineFallback && (
              <span className="text-[11px] text-amber-700 bg-amber-100 px-2 py-0.5 rounded font-bold">
                {ocrResult.notice || 'AI assistance unavailable; manual scrutiny required'}
              </span>
            )}

            {ocrResult?.confidences && !ocrResult.isOfflineFallback && (
              <div className="flex items-center gap-2">
                {ocrResult.needsHumanReview ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded font-bold">
                    <AlertTriangle className="w-3 h-3 text-amber-600" />
                    Review Required: Min Conf {Math.round(ocrResult.minConfidence * 100)}%
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded font-bold">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    High Confidence ({Math.round(ocrResult.minConfidence * 100)}%)
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block font-bold text-slate-700 mb-1">FDR Instrument Number *</label>
            <input
              type="text"
              required
              value={formData.fdrNo}
              onChange={(e) => setFormData({ ...formData, fdrNo: e.target.value })}
              placeholder="e.g. FDR-2024-987654"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-aicte-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Bank Name *</label>
            <select
              value={formData.bank}
              onChange={(e) => setFormData({ ...formData, bank: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-aicte-500 focus:outline-none bg-white"
            >
              <option value="State Bank of India">State Bank of India</option>
              <option value="Punjab National Bank">Punjab National Bank</option>
              <option value="Bank of Baroda">Bank of Baroda</option>
              <option value="Canara Bank">Canara Bank</option>
              <option value="Union Bank of India">Union Bank of India</option>
              <option value="HDFC Bank">HDFC Bank</option>
              <option value="ICICI Bank">ICICI Bank</option>
              <option value="Axis Bank">Axis Bank</option>
            </select>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Branch Name *</label>
            <input
              type="text"
              required
              value={formData.branch}
              onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
              placeholder="e.g. Parliament Street"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-aicte-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">IFSC Code *</label>
            <input
              type="text"
              required
              value={formData.ifsc}
              onChange={(e) => setFormData({ ...formData, ifsc: e.target.value.toUpperCase() })}
              placeholder="e.g. SBIN0000691"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-aicte-500 focus:outline-none uppercase font-mono"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Principal Amount (INR) *</label>
            <input
              type="number"
              required
              min="1"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              placeholder="e.g. 3500000"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-aicte-500 focus:outline-none font-semibold"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Joint Lien Marked *</label>
            <div className="flex items-center gap-2 mt-2">
              <input
                type="checkbox"
                id="lienMarked"
                checked={formData.lienMarked}
                onChange={(e) => setFormData({ ...formData, lienMarked: e.target.checked })}
                className="w-4 h-4 text-aicte-700 border-slate-300 rounded focus:ring-aicte-500"
              />
              <label htmlFor="lienMarked" className="text-slate-700 font-medium">
                Lien marked in favour of AICTE
              </label>
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Date of Issue *</label>
            <input
              type="date"
              required
              value={formData.issueDate}
              onChange={(e) => setFormData({ ...formData, issueDate: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-aicte-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Date of Maturity *</label>
            <input
              type="date"
              required
              value={formData.maturityDate}
              onChange={(e) => setFormData({ ...formData, maturityDate: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-aicte-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <label className="block font-bold text-slate-700 mb-1">Upload FDR Receipt Scan (PDF / Image)</label>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-aicte-50 file:text-aicte-700 hover:file:bg-aicte-100 cursor-pointer"
          />
        </div>

        <div className="flex justify-end gap-3 pt-3">
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 bg-aicte-700 hover:bg-aicte-800 text-white font-bold rounded-lg shadow transition text-xs"
          >
            {loading ? 'Submitting & Scanning...' : 'Submit FDR for Scrutiny'}
          </button>
        </div>
      </form>
    </div>
  );
}
