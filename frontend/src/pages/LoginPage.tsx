import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, UserCheck } from 'lucide-react';
import { apiRequest, setAuthSession } from '../api';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('password123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleLogin = async (e?: React.FormEvent, overrideEmail?: string) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError(null);

    const targetEmail = overrideEmail || email;
    try {
      const data = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: targetEmail, password }),
      });

      setAuthSession(data.accessToken, data.user);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const quickLogins = [
    { role: 'INSTITUTION', email: 'inst.north@aicte-demo.edu.in', label: 'College Principal (Institution)' },
    { role: 'OFFICER', email: 'officer.north@aicte-demo.gov.in', label: 'Regional Scrutiny Officer' },
    { role: 'AUTHORITY', email: 'bureau.head@aicte-demo.gov.in', label: 'Bureau Head (Authority)' },
    { role: 'ADMIN', email: 'admin@aicte-demo.gov.in', label: 'Portal Admin' },
  ];

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg border border-slate-200 p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 bg-aicte-50 text-aicte-700 rounded-full">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">FDR Vault Portal</h1>
          <p className="text-xs text-slate-500">AICTE Security Deposit & FDR Management System</p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={(e) => handleLogin(e)} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Email ID</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@aicte-demo.gov.in"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-aicte-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-aicte-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-aicte-700 hover:bg-aicte-800 text-white font-bold rounded-lg text-sm transition shadow"
          >
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>

        <div className="pt-4 border-t border-slate-200">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
            Demo 1-Click Role Switcher
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            {quickLogins.map((ql) => (
              <button
                key={ql.email}
                type="button"
                onClick={() => {
                  setEmail(ql.email);
                  handleLogin(undefined, ql.email);
                }}
                className="text-left px-3 py-2 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 flex items-center justify-between transition"
              >
                <div>
                  <span className="font-bold text-slate-700">{ql.label}</span>
                  <div className="text-[10px] text-slate-400">{ql.email}</div>
                </div>
                <UserCheck className="w-4 h-4 text-slate-400" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
