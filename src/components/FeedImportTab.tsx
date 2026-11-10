'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  Sliders,
  Check,
  X,
  Copy,
  Info,
  Layers,
  Sparkles,
  Globe,
  Link2,
  Pencil,
  CheckCheck,
  Plus
} from 'lucide-react';
import {
  getFeedConfigAction,
  saveFeedConfigAction,
  triggerFeedSyncAction,
  getPendingApprovalsAction,
  approvePendingProductAction,
  rejectPendingProductAction,
  approveAllPendingProductsAction,
  rejectAllPendingProductsAction,
  getSyncLogsAction
} from '@/app/actions';

export default function FeedImportTab({ onPendingCountChange }: { onPendingCountChange?: (count: number) => void }) {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  // Data states
  const [config, setConfig] = useState<any>(null);
  const [pendingItems, setPendingItems] = useState<any[]>([]);
  const [syncLogs, setSyncLogs] = useState<any[]>([]);

  // Filter & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');

  // UI state
  const [showConfig, setShowConfig] = useState(false);
  const [configForm, setConfigForm] = useState({
    url: '',
    autoApplySafe: true,
    priceThresholdPercent: 30,
    checkEanValidity: true,
    cronSecret: '',
  });
  const [copiedFeedUrl, setCopiedFeedUrl] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Inline edit state for approval
  const [editingItem, setEditingItem] = useState<{
    id: string;
    sku: string;
    name: string;
    price: string;
    brand: string;
    ean: string;
  } | null>(null);

  // Load all initial data
  const loadData = useCallback(async () => {
    try {
      const [cfg, pending, logs] = await Promise.all([
        getFeedConfigAction(),
        getPendingApprovalsAction(),
        getSyncLogsAction(10),
      ]);
      setConfig(cfg);
      setConfigForm({
        url: cfg.url || '',
        autoApplySafe: cfg.autoApplySafe,
        priceThresholdPercent: cfg.priceThresholdPercent || 30,
        checkEanValidity: cfg.checkEanValidity,
        cronSecret: cfg.cronSecret || 'shoptet-feed-sync-secret',
      });
      setPendingItems(pending);
      setSyncLogs(logs);
      if (onPendingCountChange) {
        onPendingCountChange(pending.length);
      }
    } catch (err: any) {
      console.error('Chyba při načítání feedu:', err);
      setMessage({ type: 'error', text: 'Nepodařilo se načíst data o feedu.' });
    } finally {
      setLoading(false);
    }
  }, [onPendingCountChange]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Synchronizace feedu
  const handleSync = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      const res = await triggerFeedSyncAction();
      if (res.success) {
        const reviewText =
          res.pendingReview > 0
            ? ` (${res.pendingReview} položek vyžaduje vaši kontrolu níže)`
            : ' Všechna data jsou aktuální a v pořádku.';
        setMessage({
          type: res.pendingReview > 0 ? 'info' : 'success',
          text: `Synchronizace dokončena za ${(res.durationMs / 1000).toFixed(1)}s: +${res.autoCreated} nových, ↻${res.autoUpdated} aktualizováno, ${res.unchanged} beze změny.${reviewText}`,
        });
      } else {
        setMessage({
          type: 'error',
          text: res.error || 'Při synchronizaci feedu došlo k chybě.',
        });
      }
      await loadData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Chyba při spojení se serverem.' });
    } finally {
      setSyncing(false);
    }
  };

  // Uložení konfigurace
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    try {
      const res = await saveFeedConfigAction(configForm);
      if (res.success) {
        setMessage({ type: 'success', text: 'Nastavení automatického feedu bylo úspěšně uloženo.' });
        setShowConfig(false);
        await loadData();
      } else {
        setMessage({ type: 'error', text: 'Nepodařilo se uložit nastavení.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Chyba při ukládání konfigurace.' });
    }
  };

  // Schválení konkrétního produktu
  const handleApproveOne = async (id: string, overrides?: { name?: string; price?: number; brand?: string; ean?: string }) => {
    setActionLoadingId(id);
    try {
      const res = await approvePendingProductAction(id, overrides);
      if (res.success) {
        setPendingItems((prev) => prev.filter((item) => item.id !== id));
        setEditingItem(null);
        if (onPendingCountChange) {
          onPendingCountChange(Math.max(0, pendingItems.length - 1));
        }
        await loadData();
      } else {
        alert(res.error || 'Položku se nepodařilo schválit.');
      }
    } finally {
      setActionLoadingId(null);
    }
  };

  // Odmítnutí konkrétního produktu
  const handleRejectOne = async (id: string) => {
    setActionLoadingId(id);
    try {
      const res = await rejectPendingProductAction(id);
      if (res.success) {
        setPendingItems((prev) => prev.filter((item) => item.id !== id));
        if (onPendingCountChange) {
          onPendingCountChange(Math.max(0, pendingItems.length - 1));
        }
        await loadData();
      } else {
        alert(res.error || 'Položku se nepodařilo odmítnout.');
      }
    } finally {
      setActionLoadingId(null);
    }
  };

  // Hromadné schválení
  const handleApproveAll = async () => {
    if (!window.confirm(`Opravdu chcete schválit a zapsat všech ${filteredItems.length} zobrazených produktů do katalogu?`)) {
      return;
    }
    setBulkLoading(true);
    try {
      const ids = filteredItems.map((i) => i.id);
      const res = await approveAllPendingProductsAction(ids);
      if (res.success) {
        setMessage({ type: 'success', text: `Úspěšně schváleno a uloženo ${res.count} produktů.` });
        await loadData();
      }
    } finally {
      setBulkLoading(false);
    }
  };

  // Hromadné odmítnutí
  const handleRejectAll = async () => {
    if (!window.confirm(`Opravdu chcete odmítnout a zahodit ${filteredItems.length} zobrazených změn?`)) {
      return;
    }
    setBulkLoading(true);
    try {
      const ids = filteredItems.map((i) => i.id);
      const res = await rejectAllPendingProductsAction(ids);
      if (res.success) {
        setMessage({ type: 'info', text: `Odmítnuto ${res.count} položek.` });
        await loadData();
      }
    } finally {
      setBulkLoading(false);
    }
  };

  // Kopírování URL feedu
  const copyFeedUrl = () => {
    if (!config?.url) return;
    navigator.clipboard.writeText(config.url);
    setCopiedFeedUrl(true);
    setTimeout(() => setCopiedFeedUrl(false), 2000);
  };

  // Kopírování webhook URL
  const copyWebhookUrl = () => {
    if (typeof window === 'undefined') return;
    const origin = window.location.origin;
    const webhookUrl = `${origin}/api/cron/sync-feed?secret=${configForm.cronSecret}`;
    navigator.clipboard.writeText(webhookUrl);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2500);
  };

  // Filtrování položek
  const filteredItems = pendingItems.filter((item) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      item.sku.toLowerCase().includes(q) ||
      item.name.toLowerCase().includes(q) ||
      (item.brand && item.brand.toLowerCase().includes(q));

    if (!matchesSearch) return false;

    if (filterType === 'all') return true;
    if (filterType === 'price' && item.warningType === 'price_jump') return true;
    if (filterType === 'ean' && (item.warningType === 'invalid_ean' || item.warningMessage.includes('EAN'))) return true;
    if (filterType === 'new' && (item.warningType === 'new_product' || item.warningType === 'suspicious_new')) return true;
    return true;
  });

  // Skutečný stav feedu podle toho, zda čekají nějaké položky
  const hasPendingItems = pendingItems.length > 0;
  const isSyncSuccess = !hasPendingItems && config?.syncStatus !== 'error';

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center text-slate-400">
        <RefreshCw className="w-8 h-8 animate-spin text-indigo-500 mb-3" />
        <p className="text-sm font-medium">Načítání stavu Shoptet feedu...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Horní info hláška */}
      {message && (
        <div
          className={`p-4 rounded-xl border flex items-start justify-between gap-3 text-sm font-medium animate-in fade-in slide-in-from-top-2 ${
            message.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : message.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-indigo-50 border-indigo-200 text-indigo-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {message.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />}
            {message.type === 'error' && <XCircle className="w-5 h-5 text-rose-600 shrink-0" />}
            {message.type === 'info' && <Info className="w-5 h-5 text-indigo-600 shrink-0" />}
            <span>{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="opacity-60 hover:opacity-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* HLAVNÍ KARTA STAVU FEEDU */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 overflow-hidden space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                <Sparkles className="w-3.5 h-3.5" />
                Shoptet Live Feed
              </span>

              {/* Dynamický stav: pokud nic nečeká, svítí zeleně */}
              {hasPendingItems ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-300">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  Vyžaduje kontrolu ({pendingItems.length})
                </span>
              ) : isSyncSuccess ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Vše synchronizováno
                </span>
              ) : config?.syncStatus === 'running' ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Právě probíhá...
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Chyba synchronizace
                </span>
              )}
            </div>

            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
              Automatická synchronizace produktů
            </h2>

            <div className="flex items-center gap-4 text-xs text-slate-500 pt-0.5">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                Poslední kontrola:{' '}
                <strong className="text-slate-700 font-semibold">
                  {config?.lastSyncAt
                    ? new Date(config.lastSyncAt).toLocaleString('cs-CZ', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })
                    : 'Doposud neproběhla'}
                </strong>
              </span>
              <span>•</span>
              <span>
                Práh cenového skoku: <strong className="text-slate-700 font-semibold">{config?.priceThresholdPercent ?? 30} %</strong>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setShowConfig(!showConfig)}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 active:scale-95 rounded-xl transition-all cursor-pointer"
            >
              <Sliders className="w-4 h-4 text-slate-500" />
              Nastavení feedu
              {showConfig ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            <button
              type="button"
              onClick={handleSync}
              disabled={syncing}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] rounded-xl shadow-md shadow-indigo-600/20 transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Stahuji a kontroluji feed...' : 'Synchronizovat nyní'}
            </button>
          </div>
        </div>

        {/* ELEGANTNÍ POLE S ODKAZEM NA FEED (PŘEPRACOVANÉ, BEZ OŘEZÁVÁNÍ TEXTU) */}
        <div className="bg-slate-50/80 border border-slate-200/90 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-lg bg-indigo-100/70 text-indigo-600 flex items-center justify-center shrink-0">
              <Globe className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
                Zdrojový exportní odkaz Shoptetu
              </div>
              <div
                className="text-xs font-mono text-slate-700 font-medium truncate select-all"
                title={config?.url}
              >
                {config?.url}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
            <button
              type="button"
              onClick={copyFeedUrl}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg shadow-2xs transition-colors cursor-pointer"
              title="Kopírovat URL feedu do schránky"
            >
              {copiedFeedUrl ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedFeedUrl ? 'Zkopírováno' : 'Kopírovat'}</span>
            </button>

            {config?.url && (
              <a
                href={config.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-white hover:bg-indigo-50 border border-slate-200 rounded-lg shadow-2xs transition-colors"
                title="Stáhnout / otevřít feed v novém okně"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Otevřít feed</span>
              </a>
            )}

            <button
              type="button"
              onClick={() => setShowConfig(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg shadow-2xs transition-colors cursor-pointer"
              title="Upravit nastavení nebo URL adresu feedu"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>Změnit</span>
            </button>
          </div>
        </div>

        {/* ROZBALOVACÍ NASTAVENÍ FEEDU */}
        {showConfig && (
          <form
            onSubmit={handleSaveConfig}
            className="pt-6 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in duration-200"
          >
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                URL adresa Shoptet exportu (XLSX / XLS / XML)
              </label>
              <input
                type="url"
                required
                value={configForm.url}
                onChange={(e) => setConfigForm({ ...configForm, url: e.target.value })}
                className="w-full px-3.5 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                placeholder="https://www.vas-eshop.cz/export/products.xls?..."
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Zadejte exportní odkaz ze Shoptetu (vzor produktů nebo XML). Systém automaticky detekuje XLSX i XML formát.
              </p>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Podezřelý cenový skok (v %)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="5"
                  max="500"
                  value={configForm.priceThresholdPercent}
                  onChange={(e) =>
                    setConfigForm({ ...configForm, priceThresholdPercent: Number(e.target.value) || 30 })
                  }
                  className="w-24 px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
                />
                <span className="text-xs text-slate-600 font-semibold">% změny stávající ceny</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5">
                Pokud se prodejní cena v novém feedu změní o více než toto procento, bude zařazena ke schválení.
              </p>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={configForm.autoApplySafe}
                  onChange={(e) => setConfigForm({ ...configForm, autoApplySafe: e.target.checked })}
                  className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                />
                Automaticky propsat bezpečné změny
              </label>
              <p className="text-[11px] text-slate-500 ml-6">
                Pokud je zaškrtnuto, produkty bez varování a běžné novinky se zapíší rovnou. Do schvalování jdou pouze anomálie.
              </p>
            </div>

            {/* Cron & Webhook nastavení */}
            <div className="md:col-span-2 bg-indigo-50/60 p-4 rounded-xl border border-indigo-100">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="flex-1">
                  <h4 className="text-xs font-bold text-indigo-950 uppercase tracking-wider mb-1">
                    Automatické spouštění (Cron / Webhook)
                  </h4>
                  <p className="text-xs text-indigo-700/90 mb-2">
                    Pro pravidelnou noční synchronizaci můžete zavolat tento webhook ze serverového plánovače (cronu):
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="text-xs font-mono bg-white px-2.5 py-1.5 rounded-lg border border-indigo-200 text-indigo-900 select-all">
                      /api/cron/sync-feed?secret={configForm.cronSecret}
                    </code>
                    <button
                      type="button"
                      onClick={copyWebhookUrl}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white text-indigo-700 hover:bg-indigo-50 border border-indigo-200 rounded-lg transition-colors shadow-2xs cursor-pointer"
                    >
                      {copiedWebhook ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedWebhook ? 'Zkopírováno' : 'Kopírovat celé URL'}
                    </button>
                  </div>
                </div>

                <div className="w-full md:w-56 shrink-0">
                  <label className="block text-[11px] font-bold text-indigo-950 uppercase tracking-wider mb-1">
                    Tajný klíč (secret)
                  </label>
                  <input
                    type="text"
                    value={configForm.cronSecret}
                    onChange={(e) => setConfigForm({ ...configForm, cronSecret: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-indigo-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

            <div className="md:col-span-2 flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfig(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Zavřít
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors cursor-pointer"
              >
                Uložit nastavení feedu
              </button>
            </div>
          </form>
        )}
      </div>

      {/* SEKCE KE SCHVÁLENÍ (PENDING APPROVALS) */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-500" />
              Položky čekající na schválení
            </h3>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                hasPendingItems
                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                  : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {pendingItems.length}
            </span>
          </div>

          {hasPendingItems && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRejectAll}
                disabled={bulkLoading || filteredItems.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                Odmítnout vše ({filteredItems.length})
              </button>
              <button
                type="button"
                onClick={handleApproveAll}
                disabled={bulkLoading || filteredItems.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 border border-emerald-600 rounded-lg transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Schválit vše ({filteredItems.length})
              </button>
            </div>
          )}
        </div>

        {/* Vyhledávání a filtry */}
        {hasPendingItems && (
          <div className="bg-white p-3 rounded-xl border border-slate-200 flex flex-wrap items-center gap-3">
            <input
              type="text"
              placeholder="Hledat v podezřelých položkách (SKU, název, značka)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 min-w-[200px] px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="flex items-center gap-1 text-xs">
              <button
                type="button"
                onClick={() => setFilterType('all')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                  filterType === 'all' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Vše ({pendingItems.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterType('price')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                  filterType === 'price' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Cenové skoky
              </button>
              <button
                type="button"
                onClick={() => setFilterType('ean')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                  filterType === 'ean' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                EAN kódy
              </button>
            </div>
          </div>
        )}

        {/* SEZNAM ČEKAJÍCÍCH POLOŽEK */}
        {!hasPendingItems ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-2">
            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-2">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 className="text-base font-bold text-slate-800">
              Žádné podezřelé položky nečekají na schválení
            </h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Všechny změny z feedu odpovídají nastaveným pravidlům. Databáze je plně aktuální.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredItems.map((item) => {
              let parsedChanges: { field: string; from: any; to: any }[] = [];
              try {
                if (item.changes) parsedChanges = JSON.parse(item.changes);
              } catch {}

              const isPriceJump = item.warningType === 'price_jump';
              const isLoadingThis = actionLoadingId === item.id;
              const isEditingThis = editingItem?.id === item.id;

              return (
                <div
                  key={item.id}
                  className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 hover:border-slate-300 transition-all"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Popis produktu */}
                    <div className="space-y-1.5 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold bg-slate-100 text-slate-800 px-2 py-0.5 rounded">
                          {item.sku}
                        </span>
                        {item.brand && (
                          <span className="text-xs font-semibold text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                            {item.brand}
                          </span>
                        )}
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full ${
                            isPriceJump
                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                              : 'bg-rose-100 text-rose-800 border border-rose-300'
                          }`}
                        >
                          <AlertTriangle className="w-3.5 h-3.5" />
                          {item.warningMessage}
                        </span>
                      </div>

                      {/* Normální zobrazení vs Inline editace */}
                      {!isEditingThis || !editingItem ? (
                        <h4 className="text-sm font-bold text-slate-900">{item.name}</h4>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 pb-1">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase">
                              Upravit název produktu
                            </label>
                            <input
                              type="text"
                              value={editingItem.name}
                              onChange={(e) => {
                                const val = e.target.value;
                                setEditingItem((prev) => (prev ? { ...prev, name: val } : null));
                              }}
                              className="w-full px-2 py-1 text-xs font-semibold border border-indigo-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase">
                              Upravit schvalovanou cenu (Kč)
                            </label>
                            <input
                              type="number"
                              step="0.1"
                              value={editingItem.price}
                              onChange={(e) => {
                                const val = e.target.value;
                                setEditingItem((prev) => (prev ? { ...prev, price: val } : null));
                              }}
                              className="w-32 px-2 py-1 text-xs font-bold border border-indigo-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </div>
                        </div>
                      )}

                      {/* Rozdíly změn (Diff) */}
                      {parsedChanges.length > 0 && !isEditingThis && (
                        <div className="pt-1.5 flex flex-wrap gap-2 text-xs">
                          {parsedChanges.map((ch, idx) => (
                            <div
                              key={idx}
                              className="inline-flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200"
                            >
                              <span className="font-bold text-slate-600">{ch.field}:</span>
                              <span className="line-through text-slate-400 font-medium">{String(ch.from || '-')}</span>
                              <ArrowRight className="w-3 h-3 text-slate-400" />
                              <span className="font-bold text-slate-900">{String(ch.to || '-')}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Akce schválení / odmítnutí */}
                    <div className="flex items-center gap-2 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100">
                      {!isEditingThis ? (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              setEditingItem({
                                id: item.id,
                                sku: item.sku,
                                name: item.name,
                                price: String(item.price ?? ''),
                                brand: item.brand || '',
                                ean: item.ean || '',
                              })
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-semibold text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                            title="Upravit hodnoty před schválením"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            Upravit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRejectOne(item.id)}
                            disabled={isLoadingThis || bulkLoading}
                            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-rose-50 hover:text-rose-700 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                            title="Odmítnout a ponechat stávající data"
                          >
                            <X className="w-3.5 h-3.5" />
                            Odmítnout
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApproveOne(item.id)}
                            disabled={isLoadingThis || bulkLoading}
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                            title="Schválit změnu a zapsat do databáze"
                          >
                            {isLoadingThis ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            Schválit
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => setEditingItem(null)}
                            className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                          >
                            Zrušit úpravu
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!editingItem) return;
                              handleApproveOne(item.id, {
                                name: editingItem.name,
                                price: parseFloat(editingItem.price) || item.price,
                              });
                            }}
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-all cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Uložit a schválit
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* HISTORIE SYNCHRONIZACÍ (ČISTÉ IKONY MÍSTO POŠKOZENÝCH SYMBOLŮ) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Clock className="w-4 h-4 text-slate-500" />
          Historie běhů synchronizace feedu
        </h3>

        {syncLogs.length === 0 ? (
          <p className="text-xs text-slate-400 italic">Doposud nebyla zaznamenána žádná synchronizace.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider">
                  <th className="pb-2.5">Datum a čas</th>
                  <th className="pb-2.5">Stav</th>
                  <th className="pb-2.5">Celkem ve feedu</th>
                  <th className="pb-2.5 text-emerald-600 font-bold">Nových</th>
                  <th className="pb-2.5 text-indigo-600 font-bold">Upraveno</th>
                  <th className="pb-2.5 text-amber-600 font-bold">K posouzení</th>
                  <th className="pb-2.5 text-slate-500">Beze změn</th>
                  <th className="pb-2.5 text-right">Doba trvání</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {syncLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/50">
                    <td className="py-2.5 font-mono text-slate-500">
                      {new Date(log.createdAt).toLocaleString('cs-CZ', {
                        dateStyle: 'short',
                        timeStyle: 'medium',
                      })}
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold ${
                          log.status === 'success'
                            ? 'bg-emerald-50 text-emerald-700'
                            : log.status === 'warning'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {log.status === 'success' && 'Úspěch'}
                        {log.status === 'warning' && 'Vyžaduje kontrolu'}
                        {log.status === 'error' && 'Chyba'}
                      </span>
                    </td>
                    <td className="py-2.5 font-bold">{log.totalFetched}</td>
                    <td className="py-2.5 text-emerald-700 font-bold">
                      <span className="inline-flex items-center gap-0.5">
                        <Plus className="w-3 h-3 text-emerald-500" />
                        {log.autoCreated}
                      </span>
                    </td>
                    <td className="py-2.5 text-indigo-700 font-bold">
                      <span className="inline-flex items-center gap-1">
                        <RefreshCw className="w-3 h-3 text-indigo-500" />
                        {log.autoUpdated}
                      </span>
                    </td>
                    <td className="py-2.5 font-bold">
                      {log.pendingReview > 0 ? (
                        <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200">
                          <AlertTriangle className="w-3 h-3 text-amber-600" />
                          {log.pendingReview}
                        </span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="py-2.5 text-slate-400">{log.unchanged}</td>
                    <td className="py-2.5 text-right font-mono text-slate-400">
                      {(log.durationMs / 1000).toFixed(1)} s
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
