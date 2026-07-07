'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { login } from '../actions';
import { Tag, Lock, User, AlertTriangle, Loader2 } from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('returnUrl') || '/';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await login(username, password);
      if (res.success) {
        // Povedlo se, přesměrujeme uživatele zpět
        router.push(returnUrl);
        router.refresh();
      } else {
        setError(res.error || 'Nesprávné přihlašovací údaje.');
      }
    } catch (err) {
      setError('Při přihlašování došlo k neočekávané chybě.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 max-w-md w-full shadow-2xl relative z-10 animate-in fade-in zoom-in-95 duration-300">
      
      {/* Logo and Header */}
      <div className="text-center mb-8">
        <div className="inline-flex bg-indigo-600/10 p-3.5 rounded-2xl text-indigo-400 border border-indigo-500/20 shadow-inner mb-4 animate-bounce duration-[3000ms]">
          <Tag className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-200 via-indigo-100 to-white bg-clip-text text-transparent">
          Generátor štítků
        </h1>
        <p className="text-xs text-slate-400 mt-1.5 font-medium">
          Vstup pro oprávněné zaměstnance firmy
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-5" autoComplete="off">
        {error && (
          <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-xl flex items-center gap-2.5 text-xs font-semibold animate-in shake duration-300">
            <AlertTriangle className="w-4.5 h-4.5 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Username Input */}
        <div className="space-y-1.5">
          <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Uživatelské jméno
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
              <User className="w-4.5 h-4.5" />
            </span>
            <input
              type="text"
              required
              disabled={loading}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Např: admin"
              autoComplete="new-password"
              className="w-full rounded-xl border border-slate-800 bg-slate-950/40 text-slate-200 pl-10 pr-4 py-3 text-sm transition-all focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 placeholder-slate-600 disabled:opacity-50"
            />
          </div>
        </div>

        {/* Password Input */}
        <div className="space-y-1.5">
          <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Heslo
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
              <Lock className="w-4.5 h-4.5" />
            </span>
            <input
              type="password"
              required
              disabled={loading}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              autoComplete="new-password"
              className="w-full rounded-xl border border-slate-800 bg-slate-950/40 text-slate-200 pl-10 pr-4 py-3 text-sm transition-all focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 placeholder-slate-600 disabled:opacity-50"
            />
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full mt-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-indigo-600/10 hover:shadow-indigo-500/20 hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-white/80" />
              <span>Ověřování...</span>
            </>
          ) : (
            <span>Přihlásit se</span>
          )}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 relative overflow-hidden px-4 select-none">
      {/* Background ambient glow shapes */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none animate-pulse duration-[6000ms]" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none animate-pulse duration-[8000ms]" />

      <Suspense fallback={
        <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 max-w-md w-full shadow-2xl relative z-10 flex flex-col items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-400 mb-2" />
          <span className="text-slate-400 text-sm font-medium">Načítání...</span>
        </div>
      }>
        <LoginForm />
      </Suspense>
    </div>
  );
}
