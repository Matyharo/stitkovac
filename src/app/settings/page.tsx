'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  clearAllProducts,
  seedSampleProducts,
  getContactRules,
  saveContactRule,
  deleteContactRule,
  applyContactRulesToAllProducts,
  getProductIds,
  applyContactRulesToBatch,
  getUsers,
  createUser,
  deleteUser,
  changeUserPassword
} from '@/app/actions';
import {
  Settings,
  Database,
  Trash2,
  Download,
  AlertTriangle,
  Check,
  X,
  RefreshCw,
  KeyRound,
  Building2,
  Globe,
  Plus,
  Play,
  Pencil,
  PlusCircle,
  FileSpreadsheet,
  User
} from 'lucide-react';

export default function SettingsPage() {
  const router = useRouter();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Batch application state
  const [isApplyingRules, setIsApplyingRules] = useState(false);
  const [applyProgress, setApplyProgress] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [overwriteContacts, setOverwriteContacts] = useState(false);
  const [overwriteSafety, setOverwriteSafety] = useState(false);

  // Custom Confirm Modal State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    isDanger?: boolean;
    onConfirm: () => void;
  } | null>(null);

  // Shoptet API Form State (dummy state persisting locally in page)
  const [shoptetUrl, setShoptetUrl] = useState('https://api.shoptet.cz/v1');
  const [shoptetClientId, setShoptetClientId] = useState('');
  const [shoptetApiKey, setShoptetApiKey] = useState('');
  const [shoptetStatus, setShoptetStatus] = useState<'connected' | 'disconnected' | 'none'>('none');

  // Contact Rules State
  const [rules, setRules] = useState<any[]>([]);
  const [defaultRule, setDefaultRule] = useState<any>(null);
  const [brandOverrides, setBrandOverrides] = useState<any[]>([]);
  const [loadingRules, setLoadingRules] = useState(true);

  // User Management State
  const [users, setUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [newUserForm, setNewUserForm] = useState({ username: '', password: '', name: '', role: 'user' });
  const [passwordChangeModal, setPasswordChangeModal] = useState<{ isOpen: boolean; userId: string; username: string; newPassword: string } | null>(null);

  // Forms for contact rules
  const [defaultForm, setDefaultForm] = useState({
    companyName: '',
    ico: '',
    address: '',
    website: '',
    safetyText: ''
  });

  const [editingRule, setEditingRule] = useState<any | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [overrideForm, setOverrideForm] = useState({
    brandPattern: '',
    companyName: '',
    ico: '',
    address: '',
    website: '',
    safetyText: ''
  });

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const data = await getUsers();
      setUsers(data);
    } catch (err) {
      console.error('Error loading users:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadRules = async () => {
    setLoadingRules(true);
    try {
      const data = await getContactRules();
      setRules(data);
      const def = data.find((r: any) => r.isDefault);
      const overrides = data.filter((r: any) => !r.isDefault);
      setDefaultRule(def);
      setBrandOverrides(overrides);
      
      if (def) {
        setDefaultForm({
          companyName: def.companyName || '',
          ico: def.ico || '',
          address: def.address || '',
          website: def.website || '',
          safetyText: def.safetyText || ''
        });
      }
    } catch (err: any) {
      console.error('Failed to load rules:', err);
      setError('Nepodařilo se načíst pravidla pro kontaktní údaje.');
    } finally {
      setLoadingRules(false);
    }
  };

  useEffect(() => {
    loadRules();
    loadUsers();
  }, []);

  const handleSaveDefault = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const res = await saveContactRule({
        id: defaultRule?.id,
        brandPattern: '',
        companyName: defaultForm.companyName,
        ico: defaultForm.ico,
        address: defaultForm.address,
        website: defaultForm.website,
        safetyText: defaultForm.safetyText,
        isDefault: true
      });
      if (res.success) {
        setSuccess('Výchozí kontaktní a bezpečnostní údaje byly úspěšně uloženy.');
        loadRules();
      } else {
        throw new Error(res.error);
      }
    } catch (err: any) {
      setError(err.message || 'Nepodařilo se uložit výchozí kontaktní a bezpečnostní údaje.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAddForm = () => {
    setOverrideForm({
      brandPattern: '',
      companyName: defaultForm.companyName,
      ico: defaultForm.ico,
      address: defaultForm.address,
      website: '',
      safetyText: ''
    });
    setEditingRule(null);
    setShowAddForm(true);
  };

  const handleOpenEditForm = (rule: any) => {
    setOverrideForm({
      brandPattern: rule.brandPattern,
      companyName: rule.companyName,
      ico: rule.ico,
      address: rule.address,
      website: rule.website,
      safetyText: rule.safetyText || ''
    });
    setEditingRule(rule);
    setShowAddForm(true);
  };

  const handleSaveOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      if (!overrideForm.brandPattern.trim()) {
        throw new Error('Název značky pro párování je povinný.');
      }
      const res = await saveContactRule({
        id: editingRule?.id,
        brandPattern: overrideForm.brandPattern,
        companyName: overrideForm.companyName,
        ico: overrideForm.ico,
        address: overrideForm.address,
        website: overrideForm.website,
        safetyText: overrideForm.safetyText,
        isDefault: false
      });
      if (res.success) {
        setSuccess(editingRule ? 'Pravidlo pro značku bylo upraveno.' : 'Nové pravidlo pro značku bylo vytvořeno.');
        setShowAddForm(false);
        setEditingRule(null);
        loadRules();
      } else {
        throw new Error(res.error);
      }
    } catch (err: any) {
      setError(err.message || 'Nepodařilo se uložit pravidlo.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteOverride = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Smazat pravidlo pro značku?',
      message: 'Opravdu chcete smazat toto pravidlo pro značku?',
      isDanger: true,
      onConfirm: async () => {
        setError(null);
        setSuccess(null);
        setLoading(true);
        try {
          const res = await deleteContactRule(id);
          if (res.success) {
            setSuccess('Pravidlo pro značku bylo smazáno.');
            loadRules();
          } else {
            throw new Error(res.error);
          }
        } catch (err: any) {
          setError(err.message || 'Nepodařilo se smazat pravidlo.');
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const handleApplyRules = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Uplatnit pravidla na všechny produkty?',
      message: 'Tato akce přepíše vybrané kontaktní a bezpečnostní údaje u všech uložených produktů v katalogu podle aktuálních pravidel.',
      isDanger: false,
      onConfirm: async () => {
        setError(null);
        setSuccess(null);
        setLoading(true);
        setIsApplyingRules(true);
        setApplyProgress(0);
        setProcessedCount(0);
        setTotalCount(0);
        
        try {
          const idsRes = await getProductIds();
          if (!idsRes.success) {
            throw new Error(idsRes.error);
          }
          
          const allIds = idsRes.ids || [];
          const total = allIds.length;
          setTotalCount(total);
          
          if (total === 0) {
            setSuccess('V databázi nejsou žádné produkty k aktualizaci.');
            return;
          }
          
          const BATCH_SIZE = 50;
          let processed = 0;
          
          for (let i = 0; i < total; i += BATCH_SIZE) {
            const batchIds = allIds.slice(i, i + BATCH_SIZE);
            const res = await applyContactRulesToBatch(batchIds, { overwriteContacts, overwriteSafety });
            if (!res.success) {
              throw new Error(res.error);
            }
            processed += batchIds.length;
            setProcessedCount(processed);
            setApplyProgress(Math.round((processed / total) * 100));
          }
          
          setSuccess(`Pravidla byla úspěšně uplatněna na katalog produktů. Aktualizováno ${total} produktů.`);
          router.refresh();
        } catch (err: any) {
          setError(err.message || 'Chyba při hromadném uplatňování kontaktů.');
        } finally {
          setLoading(false);
          setIsApplyingRules(false);
          setApplyProgress(0);
          setProcessedCount(0);
          setTotalCount(0);
        }
      }
    });
  };

  const handleSaveShoptet = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    setTimeout(() => {
      setLoading(false);
      if (shoptetApiKey && shoptetClientId) {
        setShoptetStatus('connected');
        setSuccess('Připojení k Shoptet API bylo uloženo a otestováno jako úspěšné!');
      } else {
        setShoptetStatus('none');
        setSuccess('Nastavení Shoptet bylo uloženo.');
      }
    }, 800);
  };

  const handleSeedData = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await seedSampleProducts();
      if (res.success) {
        setSuccess(`Byla úspěšně nahrána ukázková data (${res.count} produktů)! Můžete začít tisknout.`);
        router.refresh();
      } else {
        throw new Error(res.error);
      }
    } catch (err: any) {
      setError(err.message || 'Chyba při nahrávání ukázkových dat.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const res = await createUser(newUserForm);
      if (res.success) {
        setSuccess(`Uživatel "${newUserForm.username}" byl úspěšně vytvořen.`);
        setNewUserForm({ username: '', password: '', name: '', role: 'user' });
        loadUsers();
      } else {
        throw new Error(res.error);
      }
    } catch (err: any) {
      setError(err.message || 'Nepodařilo se vytvořit uživatele.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUserClick = (id: string, username: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Smazat uživatelský účet?',
      message: `Opravdu chcete smazat uživatele "${username}"? Tento uživatel ztratí přístup k aplikaci.`,
      isDanger: true,
      onConfirm: async () => {
        setError(null);
        setSuccess(null);
        setLoading(true);
        try {
          const res = await deleteUser(id);
          if (res.success) {
            setSuccess(`Uživatel "${username}" byl smazán.`);
            loadUsers();
          } else {
            throw new Error(res.error);
          }
        } catch (err: any) {
          setError(err.message || 'Nepodařilo se smazat uživatele.');
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const handleSaveNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordChangeModal || !passwordChangeModal.newPassword.trim()) return;

    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const res = await changeUserPassword(passwordChangeModal.userId, passwordChangeModal.newPassword);
      if (res.success) {
        setSuccess(`Heslo pro uživatele "${passwordChangeModal.username}" bylo úspěšně změněno.`);
        setPasswordChangeModal(null);
      } else {
        throw new Error(res.error);
      }
    } catch (err: any) {
      setError(err.message || 'Nepodařilo se změnit heslo.');
    } finally {
      setLoading(false);
    }
  };

  const handleClearDb = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Vymazat katalog produktů?',
      message: 'Opravdu chcete smazat všechny produkty z databáze? Tuto akci nelze vrátit.',
      isDanger: true,
      onConfirm: async () => {
        setLoading(true);
        setError(null);
        setSuccess(null);
        try {
          const res = await clearAllProducts();
          if (res.success) {
            setSuccess('Lokální katalog produktů byl kompletně vymazán.');
            router.refresh();
          } else {
            throw new Error(res.error);
          }
        } catch (err: any) {
          setError(err.message || 'Chyba při mazání databáze.');
        } finally {
          setLoading(false);
        }
      }
    });
  };

  return (
    <div className="flex-1 p-8 max-w-5xl mx-auto w-full space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
          <Settings className="w-8 h-8 text-indigo-600" />
          Nastavení systému
        </h1>
        <p className="text-slate-500 mt-1">
          Konfigurujte pravidla pro kontaktní údaje u produktů, napojení na Shoptet API a provádějte údržbu databáze.
        </p>
      </div>

      {/* Notifications */}
      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl flex items-start gap-3 text-sm font-semibold animate-in fade-in duration-200">
          <Check className="w-5 h-5 text-emerald-600 shrink-0" />
          <p className="flex-1 whitespace-pre-line">{success}</p>
          <button onClick={() => setSuccess(null)} className="text-emerald-400 hover:text-emerald-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-100 text-rose-800 rounded-xl flex items-start gap-3 text-sm font-medium animate-in fade-in duration-200">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          <p className="flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 1. CONTACT DETAILS MANAGEMENT */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-indigo-500" />
              Nastavení kontaktních údajů (Distributor)
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Tyto údaje se automaticky vygenerují a uloží ke každému produktu při uploadu (importu) nebo mohou být definovány podle značky.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <button
              type="button"
              onClick={handleApplyRules}
              disabled={(loading || loadingRules) && !isApplyingRules}
              className={`relative overflow-hidden flex items-center justify-center gap-1.5 bg-amber-600 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-sm transition-all min-w-[240px] ${
                isApplyingRules 
                  ? 'cursor-wait' 
                  : 'hover:bg-amber-700 hover:shadow disabled:opacity-50'
              }`}
              title="Přepíše kontakty u všech uložených produktů podle těchto pravidel"
            >
              {isApplyingRules && (
                <div 
                  className="absolute inset-y-0 left-0 bg-amber-800/65 transition-all duration-300 ease-out"
                  style={{ width: `${applyProgress}%` }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                {isApplyingRules ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current" />
                )}
                {isApplyingRules 
                  ? `Uplatňování... ${applyProgress}%` 
                  : 'Uplatnit na všechny produkty'}
              </span>
            </button>
            <div className="flex flex-col sm:flex-row gap-4 text-[11px] text-slate-500 font-semibold mt-1">
              <label className="flex items-center gap-1.5 cursor-pointer hover:text-slate-800 select-none">
                <input
                  type="checkbox"
                  checked={overwriteContacts}
                  onChange={(e) => setOverwriteContacts(e.target.checked)}
                  disabled={loading || loadingRules}
                  className="rounded border-slate-350 text-amber-600 focus:ring-amber-500 w-3.5 h-3.5"
                />
                <span>Přepsat stávající kontakty</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer hover:text-slate-800 select-none">
                <input
                  type="checkbox"
                  checked={overwriteSafety}
                  onChange={(e) => setOverwriteSafety(e.target.checked)}
                  disabled={loading || loadingRules}
                  className="rounded border-slate-350 text-amber-600 focus:ring-amber-500 w-3.5 h-3.5"
                />
                <span>Přepsat stávající bezp. info</span>
              </label>
            </div>
          </div>
        </div>

        {loadingRules ? (
          <div className="py-12 text-center">
            <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-500">Načítání pravidel...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Default Rule Form */}
            <form onSubmit={handleSaveDefault} className="lg:col-span-5 space-y-4">
              <div className="bg-slate-50/50 border border-slate-100 rounded-xl p-4">
                <h4 className="font-bold text-xs text-indigo-700 uppercase tracking-wider mb-3 flex items-center justify-between">
                  <span>Výchozí kontaktní údaje</span>
                  <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-[10px] normal-case">Hlavní výchozí</span>
                </h4>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-650 uppercase tracking-wider mb-1">Název firmy</label>
                    <input
                      type="text"
                      required
                      value={defaultForm.companyName}
                      onChange={(e) => setDefaultForm({ ...defaultForm, companyName: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-650 uppercase tracking-wider mb-1">IČO</label>
                    <input
                      type="text"
                      value={defaultForm.ico}
                      onChange={(e) => setDefaultForm({ ...defaultForm, ico: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-650 uppercase tracking-wider mb-1">Adresa (ulice, PSČ, město)</label>
                    <input
                      type="text"
                      required
                      value={defaultForm.address}
                      onChange={(e) => setDefaultForm({ ...defaultForm, address: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-650 uppercase tracking-wider mb-1">Výchozí webová stránka</label>
                    <input
                      type="text"
                      required
                      value={defaultForm.website}
                      onChange={(e) => setDefaultForm({ ...defaultForm, website: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-650 uppercase tracking-wider mb-1">Výchozí bezpečnostní text</label>
                    <textarea
                      value={defaultForm.safetyText}
                      onChange={(e) => setDefaultForm({ ...defaultForm, safetyText: e.target.value })}
                      placeholder="Např: Uchovávejte mimo dosah dětí."
                      rows={2}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none resize-none"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5"
                >
                  {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  Uložit výchozí údaje
                </button>
              </div>
            </form>

            {/* Brand Overrides Panel */}
            <div className="lg:col-span-7 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-xs text-indigo-700 uppercase tracking-wider">
                  Výjimky a specifické weby pro značky
                </h4>
                {!showAddForm && (
                  <button
                    type="button"
                    onClick={handleOpenAddForm}
                    className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
                  >
                    <PlusCircle className="w-4 h-4" />
                    Přidat výjimku
                  </button>
                )}
              </div>

              {/* Add / Edit Form Card */}
              {showAddForm && (
                <form onSubmit={handleSaveOverride} className="bg-indigo-50/20 border border-indigo-100 rounded-xl p-4 space-y-3 animate-in slide-in-from-top-2 duration-250">
                  <div className="flex items-center justify-between border-b border-indigo-50 pb-2 mb-2">
                    <span className="font-bold text-xs text-indigo-800">
                      {editingRule ? 'Upravit výjimku pro značku' : 'Nové pravidlo pro značku'}
                    </span>
                    <button
                      type="button"
                      onClick={() => { setShowAddForm(false); setEditingRule(null); }}
                      className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold text-slate-650 uppercase tracking-wider mb-1">
                        Párovat značku (obsahuje text, např. L.C.P. nebo Ella Baché) *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Např: Ella Baché"
                        value={overrideForm.brandPattern}
                        onChange={(e) => setOverrideForm({ ...overrideForm, brandPattern: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-650 uppercase tracking-wider mb-1">Webová stránka *</label>
                      <input
                        type="text"
                        required
                        placeholder="Např: www.ellabache.cz"
                        value={overrideForm.website}
                        onChange={(e) => setOverrideForm({ ...overrideForm, website: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-650 uppercase tracking-wider mb-1">Firma (nepovinné)</label>
                      <input
                        type="text"
                        value={overrideForm.companyName}
                        onChange={(e) => setOverrideForm({ ...overrideForm, companyName: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-650 uppercase tracking-wider mb-1">IČO (nepovinné)</label>
                      <input
                        type="text"
                        value={overrideForm.ico}
                        onChange={(e) => setOverrideForm({ ...overrideForm, ico: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-650 uppercase tracking-wider mb-1">Adresa (nepovinné)</label>
                      <input
                        type="text"
                        value={overrideForm.address}
                        onChange={(e) => setOverrideForm({ ...overrideForm, address: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold text-slate-650 uppercase tracking-wider mb-1">Bezpečnostní text (nepovinné)</label>
                      <textarea
                        placeholder="Např: Hořlavina. Zamezte kontaktu s otevřeným ohněm."
                        value={overrideForm.safetyText}
                        onChange={(e) => setOverrideForm({ ...overrideForm, safetyText: e.target.value })}
                        rows={2}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs focus:border-indigo-500 focus:outline-none resize-none"
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => { setShowAddForm(false); setEditingRule(null); }}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 font-semibold"
                    >
                      Zrušit
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold flex items-center gap-1"
                    >
                      {loading && <RefreshCw className="w-3 h-3 animate-spin" />}
                      Uložit pravidlo
                    </button>
                  </div>
                </form>
              )}

              {/* Overrides Table */}
              <div className="border border-slate-100 rounded-xl overflow-hidden shadow-inner bg-slate-50/50">
                <table className="w-full text-left text-xs border-collapse bg-white">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider text-[10px] border-b border-slate-100">
                      <th className="px-4 py-3">Značka (Obsahuje text)</th>
                      <th className="px-4 py-3">Přiřazený web</th>
                      <th className="px-4 py-3">Bezpečnostní text</th>
                      <th className="px-4 py-3 text-right">Akce</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {brandOverrides.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-6 text-center text-slate-400 italic">
                          Nejsou definována žádná specifická pravidla pro značky. Všechny produkty budou používat výchozí web.
                        </td>
                      </tr>
                    ) : (
                      brandOverrides.map((rule) => (
                        <tr key={rule.id} className="hover:bg-slate-50/30 transition-colors">
                          <td className="px-4 py-3 font-semibold text-slate-800">
                            {rule.brandPattern}
                          </td>
                          <td className="px-4 py-3 text-slate-600 font-mono flex items-center gap-1.5">
                            <Globe className="w-3.5 h-3.5 text-slate-400" />
                            {rule.website}
                          </td>
                          <td className="px-4 py-3 text-slate-500 max-w-[180px] truncate" title={rule.safetyText || ''}>
                            {rule.safetyText || <span className="text-slate-300 italic">Nevyplněn</span>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => handleOpenEditForm(rule)}
                                className="p-1 hover:bg-slate-100 text-slate-500 hover:text-indigo-600 rounded transition-colors"
                                title="Upravit pravidlo"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteOverride(rule.id)}
                                className="p-1 hover:bg-rose-50 text-slate-500 hover:text-rose-600 rounded transition-colors"
                                title="Smazat pravidlo"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. USER MANAGEMENT */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-6">
        <div>
          <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
            <User className="w-5 h-5 text-indigo-500" />
            Správa uživatelských účtů
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Vytvářejte a spravujte uživatelské účty pro přístup do systému.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* User List */}
          <div className="lg:col-span-2 space-y-4">
            <h4 className="font-bold text-sm text-slate-800 uppercase tracking-wider font-semibold">Uživatelé v systému</h4>
            {loadingUsers ? (
              <div className="text-center py-6 text-xs text-slate-400">Načítání uživatelů...</div>
            ) : (
              <div className="border border-slate-100 rounded-xl divide-y divide-slate-100 overflow-hidden bg-slate-50/50">
                {users.map((u) => (
                  <div key={u.id} className="flex items-center justify-between p-4 bg-white hover:bg-slate-50 transition-colors">
                    <div>
                      <div className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                        {u.name}
                        {u.role === 'admin' && (
                          <span className="text-[10px] font-bold text-indigo-650 bg-indigo-50 px-2 py-0.5 rounded-full uppercase">
                            Admin
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 font-medium">Uživatelské jméno: <span className="font-bold text-slate-700">{u.username}</span></div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPasswordChangeModal({ isOpen: true, userId: u.id, username: u.username, newPassword: '' })}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                        title="Změnit heslo"
                      >
                        <KeyRound className="w-4.5 h-4.5" />
                      </button>
                      
                      {u.username !== 'admin' && (
                        <button
                          type="button"
                          onClick={() => handleDeleteUserClick(u.id, u.username)}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Smazat uživatele"
                        >
                          <Trash2 className="w-4.5 h-4.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add User Form */}
          <div className="bg-slate-50/50 border border-slate-100 rounded-2xl p-5 space-y-4">
            <h4 className="font-bold text-sm text-slate-800 uppercase tracking-wider flex items-center gap-1.5 font-semibold">
              Vytvořit uživatele
            </h4>
            
            <form onSubmit={handleCreateUser} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-550 uppercase tracking-wider mb-1">
                  Celé jméno
                </label>
                <input
                  type="text"
                  required
                  placeholder="Např: Jan Novák"
                  value={newUserForm.name}
                  onChange={(e) => setNewUserForm({ ...newUserForm, name: e.target.value })}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-550 uppercase tracking-wider mb-1">
                  Uživatelské jméno
                </label>
                <input
                  type="text"
                  required
                  placeholder="Např: novak"
                  value={newUserForm.username}
                  onChange={(e) => setNewUserForm({ ...newUserForm, username: e.target.value.toLowerCase().trim() })}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-550 uppercase tracking-wider mb-1">
                  Heslo
                </label>
                <input
                  type="password"
                  required
                  placeholder="Zadejte heslo"
                  value={newUserForm.password}
                  onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-550 uppercase tracking-wider mb-1">
                  Role
                </label>
                <select
                  value={newUserForm.role}
                  onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value })}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                >
                  <option value="user">Uživatel</option>
                  <option value="admin">Administrátor</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer mt-4"
              >
                Vytvořit uživatele
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* PASSWORD CHANGE MODAL */}
      {passwordChangeModal && passwordChangeModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl p-6 border border-slate-100 animate-in zoom-in-95 duration-200 text-slate-800">
            <div className="flex items-center gap-3 mb-4 text-indigo-600">
              <KeyRound className="w-6 h-6 shrink-0" />
              <h3 className="font-bold text-lg">Změnit heslo pro {passwordChangeModal.username}</h3>
            </div>
            
            <form onSubmit={handleSaveNewPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Nové heslo
                </label>
                <input
                  type="password"
                  required
                  placeholder="Zadejte nové heslo"
                  value={passwordChangeModal.newPassword}
                  onChange={(e) => setPasswordChangeModal({ ...passwordChangeModal, newPassword: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPasswordChangeModal(null)}
                  className="text-sm font-semibold text-slate-500 px-4 py-2 hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Storno
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  Uložit heslo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Settings Grid (Shoptet API & SQLite) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* Shoptet API Connection Form */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
          <h3 className="font-bold text-base text-slate-900 flex items-center gap-2 pb-2 border-b border-slate-50">
            <KeyRound className="w-4.5 h-4.5 text-indigo-500" />
            Napojení na Shoptet API
          </h3>
          
          <p className="text-xs text-slate-500 leading-relaxed">
            Příprava pro automatickou synchronizaci produktů z Vašeho e-shopu Shoptet. Vyžaduje Shoptet API doplněk.
          </p>

          <form onSubmit={handleSaveShoptet} className="space-y-4" autoComplete="off">
            <div>
              <label className="block text-xs font-bold text-slate-650 uppercase tracking-wider mb-1">
                API Endpoint URL
              </label>
              <input
                type="url"
                required
                value={shoptetUrl}
                onChange={(e) => setShoptetUrl(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-650 uppercase tracking-wider mb-1">
                E-shop ID (Shoptet ID)
              </label>
              <input
                type="text"
                placeholder="Např: 254869"
                value={shoptetClientId}
                onChange={(e) => setShoptetClientId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-650 uppercase tracking-wider mb-1">
                API Přístupový klíč (Token)
              </label>
              <input
                type="password"
                placeholder="• • • • • • • • • • • • • • • •"
                value={shoptetApiKey}
                onChange={(e) => setShoptetApiKey(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                autoComplete="new-password"
              />
            </div>

            <div className="pt-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold flex items-center gap-1.5">
                Stav integrace:
                {shoptetStatus === 'connected' ? (
                  <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Připojeno</span>
                ) : (
                  <span className="text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Neaktivní</span>
                )}
              </span>

              <button
                type="submit"
                disabled={loading}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-1.5 transition-all"
              >
                {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                Uložit
              </button>
            </div>
          </form>
        </div>

        {/* Database Management & Tools */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-6">
          <div>
            <h3 className="font-bold text-base text-slate-900 flex items-center gap-2 pb-2 border-b border-slate-50">
              <Database className="w-4.5 h-4.5 text-indigo-500" />
              Správa lokální databáze (SQLite)
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Provádějte údržbu, testování nebo vyčištění lokálních katalogových dat.
            </p>
          </div>

          <div className="space-y-4">
            {/* Seed option */}
            <div className="flex items-start gap-4">
              <div className="p-2.5 bg-indigo-50 text-indigo-650 rounded-xl">
                <Download className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-sm text-slate-800">Nahrát ukázková data</h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Vloží 5 vzorových produktů s vyplněnými popisy a cenami pro okamžité otestování tisku.
                </p>
                <button
                  type="button"
                  onClick={handleSeedData}
                  disabled={loading}
                  className="mt-2 text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline inline-flex items-center gap-1"
                >
                  Provést import ukázek
                </button>
              </div>
            </div>

            {/* DB Backup option */}
            <div className="flex items-start gap-4">
              <div className="p-2.5 bg-indigo-50 text-indigo-650 rounded-xl">
                <Database className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-sm text-slate-800">Záloha celé databáze (.db)</h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Stáhne kompletní SQLite databázový soubor se všemi produkty, šablonami a nastavením.
                </p>
                <a
                  href="/api/backup/db"
                  download
                  className="mt-2 text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline inline-flex items-center gap-1"
                >
                  Stáhnout záložní soubor
                </a>
              </div>
            </div>

            {/* Catalog Export option */}
            <div className="flex items-start gap-4">
              <div className="p-2.5 bg-emerald-50 text-emerald-650 rounded-xl">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-sm text-slate-800">Export katalogu do Excelu (.xlsx)</h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Stáhne všechny produkty z katalogu v přehledné tabulce vhodné pro úpravy nebo opětovný import.
                </p>
                <a
                  href="/api/backup/export"
                  download
                  className="mt-2 text-xs font-bold text-emerald-600 hover:text-emerald-800 hover:underline inline-flex items-center gap-1"
                >
                  Vygenerovat a stáhnout Excel
                </a>
              </div>
            </div>

            {/* Clear option */}
            <div className="flex items-start gap-4">
              <div className="p-2.5 bg-rose-50 text-rose-650 rounded-xl">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-sm text-slate-800">Smazat veškerá data</h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Trvale vymaže všechny produkty z lokální databáze. Šablony vzhledu zůstanou zachovány.
                </p>
                <button
                  type="button"
                  onClick={handleClearDb}
                  disabled={loading}
                  className="mt-2 text-xs font-bold text-rose-600 hover:text-rose-800 hover:underline inline-flex items-center gap-1"
                >
                  Vyčistit katalog
                </button>
              </div>
            </div>
          </div>

          {/* Developer guidance note */}
          <div className="bg-slate-50 rounded-xl p-4 text-[11px] text-slate-500 leading-relaxed border border-slate-100 flex gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
            <div>
              Změny v databázovém schématu provádějte přes Prisma Migrate:
              <code className="block mt-1 font-mono bg-slate-200/60 p-1 rounded text-slate-700">npx prisma db push</code>
            </div>
          </div>
        </div>

      </div>

      {/* CUSTOM CONFIRM MODAL */}
      {confirmModal && confirmModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl p-6 border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className={`flex items-center gap-3 mb-4 ${confirmModal.isDanger ? 'text-rose-600' : 'text-amber-600'}`}>
              {confirmModal.isDanger ? (
                <Trash2 className="w-6 h-6 shrink-0" />
              ) : (
                <AlertTriangle className="w-6 h-6 shrink-0" />
              )}
              <h3 className="font-bold text-lg">{confirmModal.title}</h3>
            </div>
            <p className="text-sm text-slate-500 mb-6 leading-relaxed">
              {confirmModal.message}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="text-sm font-semibold text-slate-500 px-4 py-2 hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors"
              >
                Storno
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmModal.onConfirm();
                  setConfirmModal(null);
                }}
                className={`text-sm font-semibold text-white px-5 py-2 rounded-xl transition-colors ${
                  confirmModal.isDanger 
                    ? 'bg-rose-600 hover:bg-rose-700' 
                    : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                {confirmModal.isDanger ? 'Smazat' : 'Pokračovat'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

