'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { getActivityLogs } from '../actions';
import { 
  ScrollText, 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  RefreshCw, 
  User, 
  Info,
  Calendar,
  AlertTriangle
} from 'lucide-react';

interface LogEntry {
  id: string;
  username: string;
  action: string;
  details: string;
  createdAt: Date;
}

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);

  const fetchLogs = useCallback(async (pageNum: number, searchVal: string) => {
    setLoading(true);
    try {
      const res = await getActivityLogs(pageNum, 25, searchVal);
      if (res.success) {
        // Map string dates to Date objects if needed
        const mappedLogs = (res.logs || []).map((l: any) => ({
          ...l,
          createdAt: new Date(l.createdAt)
        }));
        setLogs(mappedLogs);
        setTotalPages(res.totalPages || 1);
        setTotalLogs(res.total || 0);
      }
    } catch (err) {
      console.error('Failed to load logs:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial load
    fetchLogs(page, search);
  }, [page, fetchLogs]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchLogs(1, search);
  };

  const handleClearSearch = () => {
    setSearch('');
    setPage(1);
    fetchLogs(1, '');
  };

  const getActionBadgeColor = (action: string) => {
    switch (action) {
      case 'LOGIN':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'LOGOUT':
        return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
      case 'PRODUCT_CREATE':
      case 'RULE_CREATE':
      case 'TEMPLATE_CREATE':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'PRODUCT_UPDATE':
      case 'RULE_UPDATE':
      case 'TEMPLATE_UPDATE':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'PRODUCT_DELETE':
      case 'PRODUCT_DELETE_MANY':
      case 'RULE_DELETE':
      case 'TEMPLATE_DELETE':
      case 'PRODUCT_CLEAR_ALL':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      case 'PRINT_JOB_CREATE':
        return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
      case 'PRODUCT_IMPORT':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      default:
        return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  return (
    <div className="p-8 max-w-7xl w-full mx-auto space-y-6">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-50 text-indigo-600 p-3 rounded-2xl border border-indigo-100 shadow-xs">
            <ScrollText className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Historie aktivit</h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">Auditní logy a přehled změn v systému</p>
          </div>
        </div>

        <button
          onClick={() => fetchLogs(page, search)}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition-all disabled:opacity-50 self-start md:self-auto cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Obnovit
        </button>
      </div>

      {/* Filter and Search Bar */}
      <form onSubmit={handleSearchSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Vyhledat v logách podle uživatele, akce nebo detailů..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 transition-all placeholder-slate-400"
          />
        </div>
        <button
          type="submit"
          className="bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white px-5 py-3 rounded-xl text-sm font-bold shadow-md shadow-indigo-600/10 transition-all cursor-pointer flex items-center gap-1.5"
        >
          <span>Hledat</span>
        </button>
        {search && (
          <button
            type="button"
            onClick={handleClearSearch}
            className="border border-slate-200 hover:bg-slate-50 text-slate-500 px-4 py-3 rounded-xl text-sm font-medium transition-all cursor-pointer"
          >
            Zrušit
          </button>
        )}
      </form>

      {/* Main Table Card */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/75 border-b border-slate-100 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <th className="px-6 py-4 w-52"><div className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-slate-400" /> Čas</div></th>
                <th className="px-6 py-4 w-44"><div className="flex items-center gap-1.5"><User className="w-3.5 h-3.5 text-slate-400" /> Uživatel</div></th>
                <th className="px-6 py-4 w-48"><div className="flex items-center gap-1.5"><Info className="w-3.5 h-3.5 text-slate-400" /> Typ akce</div></th>
                <th className="px-6 py-4">Detaily</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
                      <span className="text-xs font-medium">Načítání logů...</span>
                    </div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-16 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <AlertTriangle className="w-10 h-10 text-slate-300" />
                      <span className="font-semibold text-slate-700">Nebyly nalezeny žádné logy</span>
                      <span className="text-xs text-slate-400">Zkuste změnit vyhledávací dotaz nebo vygenerovat aktivitu.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 text-xs font-medium text-slate-500 whitespace-nowrap">
                      {log.createdAt.toLocaleString('cs-CZ')}
                    </td>
                    <td className="px-6 py-4 font-semibold text-slate-800 whitespace-nowrap">
                      {log.username}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-bold border uppercase tracking-wider ${getActionBadgeColor(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600 font-medium">
                      {log.details}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && totalLogs > 0 && (
          <div className="bg-slate-50/50 border-t border-slate-100 px-6 py-4 flex items-center justify-between">
            <div className="text-xs text-slate-500 font-medium">
              Zobrazeno <span className="font-bold text-slate-700">{logs.length}</span> z celkem <span className="font-bold text-slate-700">{totalLogs}</span> záznamů
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                  className="p-2 border border-slate-200 hover:bg-slate-50 rounded-lg disabled:opacity-40 transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="text-xs text-slate-600 font-semibold px-3">
                  Strana <span className="text-slate-800 font-bold">{page}</span> z <span className="text-slate-800 font-bold">{totalPages}</span>
                </div>
                <button
                  type="button"
                  disabled={page === totalPages}
                  onClick={() => setPage(page + 1)}
                  className="p-2 border border-slate-200 hover:bg-slate-50 rounded-lg disabled:opacity-40 transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
