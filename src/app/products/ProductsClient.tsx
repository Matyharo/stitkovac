'use client';

import React, { useState, useEffect, useTransition } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  getProducts,
  updateProduct,
  deleteProduct,
  createProduct,
  deleteProducts,
  suggestProductSafetyTextAction
} from '@/app/actions';
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  AlertCircle,
  AlertTriangle,
  Check,
  RefreshCw,
  X,
  FileSpreadsheet,
  HelpCircle,
  Tag,
  Sparkles,
  ShieldCheck
} from 'lucide-react';

interface Product {
  id: string;
  sku: string;
  name: string;
  description?: string | null;
  brand: string | null;
  price: number | null;
  safetyText: string | null;
  contactText: string | null;
  ean: string | null;
  note: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

type AiSuggestionResult = Awaited<ReturnType<typeof suggestProductSafetyTextAction>>;

interface ActiveAiProposal {
  targetKey: string;
  inputName: string;
  inputDescription: string;
  result: AiSuggestionResult;
}

export default function ProductsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Query notifications
  const importSuccess = searchParams.get('importSuccess');
  const importedCount = searchParams.get('imported');
  const updatedCount = searchParams.get('updated');

  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Bulk operation states
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState<number | 'all'>(50);

  // Filter state (allows selecting multiple filters simultaneously)
  const [selectedFilters, setSelectedFilters] = useState<string[]>([]);

  // Sorting state
  const [sortBy, setSortBy] = useState<
    | 'updatedAt_desc'
    | 'name_asc'
    | 'name_desc'
    | 'brand_asc'
    | 'brand_desc'
    | 'sku_asc'
    | 'price_asc'
    | 'price_desc'
  >('updatedAt_desc');

  const toggleFilter = (filterKey: string) => {
    setCurrentPage(1);
    if (selectedFilters.includes(filterKey)) {
      setSelectedFilters(selectedFilters.filter((f) => f !== filterKey));
    } else {
      setSelectedFilters([...selectedFilters, filterKey]);
    }
  };

  const clearFilters = () => {
    setCurrentPage(1);
    setSelectedFilters([]);
  };

  // Modals state
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  // New product form state
  const [newProductForm, setNewProductForm] = useState({
    sku: '',
    name: '',
    description: '',
    brand: '',
    price: '',
    safetyText: '',
    contactText: '',
    ean: '',
    note: '',
  });

  // AI safety text assistant state
  const aiRequestIdRef = React.useRef(0);
  const [aiLoadingTarget, setAiLoadingTarget] = useState<string | null>(null);
  const [aiProposal, setAiProposal] = useState<ActiveAiProposal | null>(null);
  const [aiVerifyConfirmed, setAiVerifyConfirmed] = useState(false);

  const invalidateAiProposal = () => {
    aiRequestIdRef.current += 1;
    setAiLoadingTarget(null);
    setAiProposal(null);
    setAiVerifyConfirmed(false);
  };

  const handleRequestAiSafety = async (
    targetKey: string,
    currentName: string,
    currentDescription: string
  ) => {
    const reqId = aiRequestIdRef.current + 1;
    aiRequestIdRef.current = reqId;
    setAiLoadingTarget(targetKey);
    setAiProposal(null);
    setAiVerifyConfirmed(false);

    try {
      const res = await suggestProductSafetyTextAction({
        name: currentName,
        description: currentDescription,
      });

      // Pokud uživatel mezitím změnil název/popis, zavřel modál nebo poslal nový dotaz,
      // starou odpověď zahodíme.
      if (aiRequestIdRef.current !== reqId) {
        return;
      }

      setAiProposal({
        targetKey,
        inputName: currentName,
        inputDescription: currentDescription,
        result: res,
      });
    } catch (err: unknown) {
      if (aiRequestIdRef.current !== reqId) {
        return;
      }
      setAiProposal({
        targetKey,
        inputName: currentName,
        inputDescription: currentDescription,
        result: {
          ok: false,
          errorType: 'unavailable',
          error: err instanceof Error ? err.message : 'Nepodařilo se získat návrh bezpečnostního textu.',
        },
      });
    } finally {
      if (aiRequestIdRef.current === reqId) {
        setAiLoadingTarget(null);
      }
    }
  };

  // Load products from DB
  const loadProducts = async (query = '') => {
    setLoading(true);
    try {
      const res = await getProducts(query);
      setProducts(res);
    } catch (err: any) {
      setError('Nepodařilo se načíst seznam produktů.');
    } finally {
      setLoading(false);
    }
  };

  // Manage debouncing and threshold for search input
  useEffect(() => {
    const query = search.trim();
    
    // Empty search -> immediately trigger reset
    if (query.length === 0) {
      setDebouncedSearch('');
      return;
    }

    // Min 3 characters threshold -> trigger with 200ms debounce
    if (query.length >= 3) {
      const timer = setTimeout(() => {
        setDebouncedSearch(search);
      }, 200);

      return () => clearTimeout(timer);
    }

    // 1 or 2 characters -> do nothing, list remains in last queried state
  }, [search]);

  // Load products whenever debouncedSearch changes
  useEffect(() => {
    startTransition(() => {
      loadProducts(debouncedSearch);
    });
  }, [debouncedSearch]);

  // Count helper variables for data quality overview
  const countMissingPrice = products.filter(
    (p) => p.price === null || p.price === undefined || p.price <= 0
  ).length;

  const countMissingEan = products.filter(
    (p) => !p.ean || p.ean.trim() === ''
  ).length;

  const countMissingSafety = products.filter(
    (p) => !p.safetyText || p.safetyText.trim() === ''
  ).length;

  const countMissingContact = products.filter(
    (p) => !p.contactText || p.contactText.trim() === ''
  ).length;

  const getFilteredProducts = () => {
    let result = products;
    if (selectedFilters.length > 0) {
      result = products.filter((prod) => {
        const hasMissingPrice = prod.price === null || prod.price === undefined || prod.price <= 0;
        const hasMissingEan = !prod.ean || prod.ean.trim() === '';
        const hasMissingSafety = !prod.safetyText || prod.safetyText.trim() === '';
        const hasMissingContact = !prod.contactText || prod.contactText.trim() === '';

        return selectedFilters.some((f) => {
          if (f === 'missing_price') return hasMissingPrice;
          if (f === 'missing_ean') return hasMissingEan;
          if (f === 'missing_safety') return hasMissingSafety;
          if (f === 'missing_contact') return hasMissingContact;
          return false;
        });
      });
    }

    // Apply sorting
    return [...result].sort((a, b) => {
      if (sortBy === 'name_asc') {
        return a.name.localeCompare(b.name, 'cs', { sensitivity: 'base' });
      }
      if (sortBy === 'name_desc') {
        return b.name.localeCompare(a.name, 'cs', { sensitivity: 'base' });
      }
      if (sortBy === 'brand_asc') {
        const brandA = a.brand || '';
        const brandB = b.brand || '';
        return brandA.localeCompare(brandB, 'cs', { sensitivity: 'base' });
      }
      if (sortBy === 'brand_desc') {
        const brandA = a.brand || '';
        const brandB = b.brand || '';
        return brandB.localeCompare(brandA, 'cs', { sensitivity: 'base' });
      }
      if (sortBy === 'sku_asc') {
        return a.sku.localeCompare(b.sku, 'cs', { sensitivity: 'base' });
      }
      if (sortBy === 'price_asc') {
        const priceA = a.price !== null ? a.price : Number.MAX_VALUE;
        const priceB = b.price !== null ? b.price : Number.MAX_VALUE;
        return priceA - priceB;
      }
      if (sortBy === 'price_desc') {
        const priceA = a.price !== null ? a.price : -1;
        const priceB = b.price !== null ? b.price : -1;
        return priceB - priceA;
      }
      
      // Default: updatedAt_desc
      const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return dateB - dateA;
    });
  };

  const filteredProducts = getFilteredProducts();

  // Pagination calculation
  const ITEMS_PER_PAGE = itemsPerPage === 'all' ? filteredProducts.length || 1 : itemsPerPage;
  const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const startItem = filteredProducts.length === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const endItem = Math.min(currentPage * ITEMS_PER_PAGE, filteredProducts.length);

  // Scroll main container to top on page change
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Helper to calculate page numbers array (with ellipses if necessary)
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 4) pages.push('...');
      
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      
      let adjustedStart = start;
      let adjustedEnd = end;
      if (currentPage <= 4) {
        adjustedEnd = 5;
      } else if (currentPage >= totalPages - 3) {
        adjustedStart = totalPages - 4;
      }
      
      for (let i = adjustedStart; i <= adjustedEnd; i++) {
        pages.push(i);
      }
      
      if (currentPage < totalPages - 3) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  // Clear query params after showing import notifications
  useEffect(() => {
    if (importSuccess) {
      setSuccessMessage(
        `Import byl úspěšný! Vytvořeno: ${importedCount || 0} produktů, Aktualizováno: ${updatedCount || 0} produktů.`
      );
      // Clean URL params without page reload
      const timer = setTimeout(() => {
        router.replace('/products');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [importSuccess, importedCount, updatedCount, router]);

  // Handle product edit submit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    setError(null);
    setSuccessMessage(null);

    const priceNum = editingProduct.price !== null ? Number(editingProduct.price) : null;

    const res = await updateProduct(editingProduct.id, {
      sku: editingProduct.sku,
      name: editingProduct.name,
      description: editingProduct.description ?? null,
      brand: editingProduct.brand,
      price: isNaN(Number(priceNum)) ? null : priceNum,
      safetyText: editingProduct.safetyText,
      contactText: editingProduct.contactText,
      ean: editingProduct.ean,
      note: editingProduct.note,
    });

    if (res.success) {
      setSuccessMessage(`Produkt "${editingProduct.name}" byl úspěšně upraven.`);
      invalidateAiProposal();
      setEditingProduct(null);
      loadProducts(debouncedSearch);
    } else {
      setError(res.error || 'Chyba při ukládání změn.');
    }
  };

  // Handle product creation submit
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProductForm.sku || !newProductForm.name) {
      setError('SKU a Název jsou povinná pole.');
      return;
    }

    setError(null);
    setSuccessMessage(null);

    const priceNum = newProductForm.price ? parseFloat(newProductForm.price) : null;

    const res = await createProduct({
      sku: newProductForm.sku,
      name: newProductForm.name,
      description: newProductForm.description || null,
      brand: newProductForm.brand || null,
      price: priceNum && !isNaN(priceNum) ? priceNum : null,
      safetyText: newProductForm.safetyText || null,
      contactText: newProductForm.contactText || null,
      ean: newProductForm.ean || null,
      note: newProductForm.note || null,
    });

    if (res.success) {
      setSuccessMessage(`Produkt "${newProductForm.name}" byl přidán.`);
      invalidateAiProposal();
      setShowCreateModal(false);
      setNewProductForm({
        sku: '',
        name: '',
        description: '',
        brand: '',
        price: '',
        safetyText: '',
        contactText: '',
        ean: '',
        note: '',
      });
      loadProducts(debouncedSearch);
    } else {
      setError(res.error || 'Chyba při vytváření produktu.');
    }
  };

  // Handle delete operation
  const handleDeleteExecute = async (id: string) => {
    setError(null);
    setSuccessMessage(null);
    const res = await deleteProduct(id);
    if (res.success) {
      setSuccessMessage('Produkt byl úspěšně smazán.');
      setShowDeleteConfirm(null);
      loadProducts(debouncedSearch);
    } else {
      setError(res.error || 'Chyba při mazání produktu.');
    }
  };

  // Handle bulk delete operation
  const handleBulkDeleteExecute = async () => {
    setError(null);
    setSuccessMessage(null);
    if (selectedProductIds.length === 0) return;

    const res = await deleteProducts(selectedProductIds);
    if (res.success) {
      setSuccessMessage(`Vybrané produkty (${selectedProductIds.length}) byly úspěšně smazány.`);
      setSelectedProductIds([]);
      setShowBulkDeleteConfirm(false);
      loadProducts(debouncedSearch);
    } else {
      setError(res.error || 'Chyba při hromadném mazání produktů.');
      setShowBulkDeleteConfirm(false);
    }
  };

  // Render helper for the AI Safety Proposal box inside Edit or Create modal
  const renderAiSafetyAssistant = (params: {
    targetKey: string;
    currentName: string;
    currentDescription: string;
    currentSafetyText: string;
    onApplySafetyText: (newText: string) => void;
  }) => {
    const { targetKey, currentName, currentDescription, currentSafetyText, onApplySafetyText } = params;
    const isLoading = aiLoadingTarget === targetKey;
    const activeProposal =
      aiProposal &&
      aiProposal.targetKey === targetKey &&
      aiProposal.inputName === currentName &&
      aiProposal.inputDescription === currentDescription
        ? aiProposal
        : null;

    if (!isLoading && !activeProposal) {
      return null;
    }

    if (isLoading) {
      return (
        <div
          data-testid="ai-safety-loading"
          className="mt-2 p-4 rounded-xl border border-indigo-200 bg-indigo-50/60 flex items-center justify-between gap-3 text-xs text-indigo-900 animate-in fade-in duration-150"
        >
          <div className="flex items-center gap-2.5">
            <RefreshCw className="w-4 h-4 text-indigo-600 animate-spin shrink-0" />
            <div>
              <span className="font-bold block">Lokální AI asistent analyzuje výrobek...</span>
              <span className="text-[11px] text-indigo-700">
                Klasifikuji podle aktuálně rozepsaného názvu a popisu přes lokální Ollamu.
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={invalidateAiProposal}
            className="text-xs font-semibold text-indigo-700 hover:text-indigo-950 px-2.5 py-1 rounded-lg hover:bg-indigo-100/70 transition-colors"
          >
            Zrušit
          </button>
        </div>
      );
    }

    if (!activeProposal) return null;
    const res = activeProposal.result;
    const availableCategories = ('categories' in res && Array.isArray(res.categories)) ? res.categories : [];

    // Seskupení kategorií podle oblasti pro přehledný výběr v <select>
    const selectableCategories = availableCategories.filter((c) => c.code !== 'NEURCENO');
    const categoriesByArea = selectableCategories.reduce<Record<string, typeof selectableCategories>>((acc, cat) => {
      const groupName = cat.area || 'Ostatní';
      if (!acc[groupName]) acc[groupName] = [];
      acc[groupName].push(cat);
      return acc;
    }, {});

    const handleManualCategoryChange = (selectedCode: string) => {
      if (!selectedCode) return;
      const chosen = availableCategories.find((c) => c.code === selectedCode);
      if (!chosen) return;
      setAiVerifyConfirmed(false);
      setAiProposal({
        ...activeProposal,
        result: {
          ok: true,
          code: chosen.code,
          rawModelCode: res.ok ? res.rawModelCode : null,
          usedFallback: false,
          manuallySelected: true,
          area: chosen.area,
          productType: chosen.productType,
          safetyText: chosen.safetyText,
          mode: chosen.mode,
          checkNote: chosen.checkNote,
          clues: chosen.clues,
          model: res.ok ? res.model : 'ruční výběr',
          categories: availableCategories,
        },
      });
    };

    const renderManualCategorySelector = (prominent: boolean, currentCode?: string) => {
      if (selectableCategories.length === 0) return null;
      return (
        <div
          className={
            prominent
              ? 'p-3 rounded-lg bg-indigo-50/90 border border-indigo-200 space-y-1.5'
              : 'pt-2 border-t border-indigo-100/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2'
          }
        >
          <label className="block text-[11px] font-bold text-indigo-950">
            {prominent
              ? 'AI si není jistá? Vyberte kategorii výrobku ručně a vygenerujte text z tabulky:'
              : 'Změnit kategorii výrobku ručně:'}
          </label>
          <select
            data-testid="ai-manual-category-select"
            value={currentCode && currentCode !== 'NEURCENO' ? currentCode : ''}
            onChange={(e) => handleManualCategoryChange(e.target.value)}
            className="w-full sm:w-auto sm:min-w-[280px] px-2.5 py-1.5 rounded-lg border border-indigo-200 bg-white text-slate-800 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
          >
            <option value="">-- Zvolte kategorii výrobku ({selectableCategories.length} šablon) --</option>
            {Object.entries(categoriesByArea).map(([areaName, items]) => (
              <optgroup key={areaName} label={areaName}>
                {items.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.productType} ({item.code})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      );
    };

    // Technická nebo validační chyba (nedostupná Ollama, chybějící model, timeout, prázdný název)
    if (!res.ok) {
      return (
        <div
          data-testid="ai-safety-error"
          className="mt-2 p-4 rounded-xl border border-rose-200 bg-rose-50/80 text-rose-900 text-xs space-y-3 animate-in fade-in duration-150"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block text-rose-950">Chyba při komunikaci s AI asistentem</span>
                <p className="mt-0.5 text-rose-800 leading-relaxed">{res.error}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={invalidateAiProposal}
              className="text-rose-400 hover:text-rose-700 p-1 rounded-lg"
              title="Zavřít"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {renderManualCategorySelector(true)}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={invalidateAiProposal}
              className="px-3 py-1.5 rounded-lg border border-rose-200 bg-white text-rose-700 font-semibold hover:bg-rose-50 transition-colors"
            >
              Zavřít
            </button>
            <button
              type="button"
              onClick={() => handleRequestAiSafety(targetKey, currentName, currentDescription)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Zkusit znovu
            </button>
          </div>
        </div>
      );
    }

    // Úspěšná klasifikace z číselníku
    const isApproveMode = res.mode === 'Návrh ke schválení';
    const isVerifyMode = res.mode === 'Ověřit konkrétní výrobek';
    const isManualMode = res.mode === 'Ruční posouzení';
    const isSkipMode = res.mode === 'Přeskočit';
    const canApply = isApproveMode || (isVerifyMode && aiVerifyConfirmed);
    const hasExistingSafety = currentSafetyText.trim().length > 0;

    const badgeClasses = isApproveMode
      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
      : isVerifyMode
      ? 'bg-amber-100 text-amber-850 border-amber-300'
      : isManualMode
      ? 'bg-rose-100 text-rose-800 border-rose-300'
      : 'bg-slate-200 text-slate-700 border-slate-300';

    return (
      <div
        data-testid="ai-safety-proposal"
        className="mt-2 p-4 rounded-xl border border-indigo-200 bg-indigo-50/40 text-slate-800 text-xs space-y-3 animate-in fade-in duration-150"
      >
        {/* Header: Typ výrobku, Kód a Režim */}
        <div className="flex items-start justify-between gap-3 border-b border-indigo-100 pb-2.5">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 font-bold text-indigo-950 text-sm">
                <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
                {res.productType}
              </span>
              <span className="font-mono text-[10px] font-bold bg-white border border-slate-200 text-slate-600 px-1.5 py-0.5 rounded">
                {res.code}
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badgeClasses}`}>
                Režim: {res.mode}
              </span>
              {res.manuallySelected && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
                  Ručně zvolená kategorie
                </span>
              )}
            </div>
            {res.area && (
              <p className="text-[11px] text-slate-500">
                Oblast: <strong className="text-slate-700">{res.area}</strong>
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={invalidateAiProposal}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-white/60 transition-colors"
            title="Zavřít návrh"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Pokyn "Co zkontrolovat" */}
        {res.checkNote && (
          <div className="p-2.5 rounded-lg bg-amber-50/90 border border-amber-200/90 text-amber-900 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block text-[11px] uppercase tracking-wider text-amber-800">
                Co zkontrolovat:
              </span>
              <p className="mt-0.5 leading-relaxed">{res.checkNote}</p>
            </div>
          </div>
        )}

        {/* Režimy s navrhovaným textem ("Návrh ke schválení" a "Ověřit konkrétní výrobek") */}
        {(isApproveMode || isVerifyMode) && (
          <div className="space-y-2.5">
            <div className={hasExistingSafety ? 'grid grid-cols-1 md:grid-cols-2 gap-2.5' : ''}>
              <div className="p-3 rounded-lg bg-white border border-indigo-200 shadow-2xs">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-indigo-600 mb-1">
                  Navrhovaný bezpečnostní text z tabulky:
                </span>
                <p data-testid="ai-proposed-text" className="text-slate-900 font-medium leading-relaxed">
                  {res.safetyText}
                </p>
              </div>

              {hasExistingSafety && (
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Stávající text ve formuláři (pro porovnání):
                  </span>
                  <p data-testid="ai-existing-text" className="text-slate-700 leading-relaxed">
                    {currentSafetyText}
                  </p>
                </div>
              )}
            </div>

            {isVerifyMode && (
              <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white border border-amber-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  data-testid="ai-verify-checkbox"
                  checked={aiVerifyConfirmed}
                  onChange={(e) => setAiVerifyConfirmed(e.target.checked)}
                  className="mt-0.5 rounded border-amber-400 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                />
                <span className="text-slate-800 font-semibold leading-snug">
                  Potvrzuji, že jsem požadované údaje pro tento konkrétní výrobek ověřil(a) a navržený text odpovídá skutečnému výrobku.
                </span>
              </label>
            )}

            {renderManualCategorySelector(false, res.code)}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={invalidateAiProposal}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 font-semibold hover:bg-slate-50 transition-colors"
              >
                Zavřít návrh
              </button>
              <button
                type="button"
                data-testid="ai-apply-proposal-btn"
                disabled={!canApply}
                onClick={() => {
                  if (!canApply) return;
                  onApplySafetyText(res.safetyText);
                  invalidateAiProposal();
                }}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold shadow-xs transition-all"
              >
                <ShieldCheck className="w-4 h-4" />
                Použít návrh
              </button>
            </div>
          </div>
        )}

        {/* Režim "Ruční posouzení" */}
        {isManualMode && (
          <div className="space-y-2.5">
            {renderManualCategorySelector(true, res.code)}
            <div className="p-3 rounded-lg bg-white border border-rose-200 text-slate-800">
              <p className="font-semibold text-rose-900">
                Pro tuto kategorii ({res.productType}) se automatický text nevkládá – vyžaduje ruční posouzení.
              </p>
              <p className="text-slate-600 mt-1">
                Pokud víte, o jaký typ výrobku jde, vyberte kategorii v rozbalovacím seznamu výše a text z tabulky se ihned zobrazí ke schválení. Případně doplňte text ručně podle obalu či bezpečnostního listu.
              </p>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={invalidateAiProposal}
                className="px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 font-semibold hover:bg-slate-50 transition-colors"
              >
                Rozumím, zavřít
              </button>
            </div>
          </div>
        )}

        {/* Režim "Přeskočit" */}
        {isSkipMode && (
          <div className="space-y-2.5">
            <div className="p-3 rounded-lg bg-white border border-slate-200 text-slate-800">
              <p className="font-semibold text-slate-900">
                Pro tuto položku ({res.productType}) se bezpečnostní etiketa nenavrhuje.
              </p>
              <p className="text-slate-600 mt-1">
                Existující bezpečnostní text ve formuláři byl ponechán beze změny.
              </p>
            </div>
            {renderManualCategorySelector(false, res.code)}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={invalidateAiProposal}
                className="px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 font-semibold hover:bg-slate-50 transition-colors"
              >
                Zavřít
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };
  // Trigger search on typing (handled via debounce effect)
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setCurrentPage(1);
  };


  return (
    <div className="flex-1 p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
            Správa produktů
          </h1>
          <p className="text-slate-500 mt-1">
            Prohlížejte, vyhledávejte a upravujte detaily produktů uložených ve Vašem lokálním katalogu.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              invalidateAiProposal();
              setShowCreateModal(true);
            }}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-semibold shadow-md shadow-indigo-600/10 transition-all duration-200"
          >
            <Plus className="w-4 h-4" />
            Nový produkt
          </button>
        </div>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl flex items-start gap-3 text-sm font-medium animate-in fade-in slide-in-from-top-2 duration-200">
          <Check className="w-5 h-5 shrink-0 text-emerald-600" />
          <p className="flex-1">{successMessage}</p>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-400 hover:text-emerald-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-100 text-rose-800 rounded-xl flex items-start gap-3 text-sm font-medium animate-in fade-in slide-in-from-top-2 duration-200">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
          <p className="flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search & Actions Bar */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-4 flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
          <input
            type="text"
            placeholder="Hledat podle názvu, kódu, značky nebo EAN..."
            value={search}
            onChange={handleSearchChange}
            className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-200 bg-slate-50/30 text-sm focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all"
          />
          {search && !isPending && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setCurrentPage(1);
              }}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:text-slate-650 hover:bg-slate-100 transition-colors cursor-pointer"
              title="Vymazat hledání"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {isPending && (
            <RefreshCw className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-500 animate-spin" />
          )}
        </div>
        <div className="text-xs text-slate-400 font-medium shrink-0">
          {selectedFilters.length > 0 ? (
            <>
              Zobrazeno: <span className="font-bold text-indigo-600">{filteredProducts.length}</span> z{' '}
              <span className="font-bold text-slate-700">{products.length}</span> produktů
            </>
          ) : (
            <>
              Nalezeno: <span className="font-bold text-slate-700">{products.length}</span> produktů
            </>
          )}
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-slate-50/50 border border-slate-100 rounded-2xl p-4 mb-6 flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold text-slate-450 uppercase tracking-wider mr-2">Filtry kvality dat:</span>
          
          <button
            type="button"
            onClick={clearFilters}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
              selectedFilters.length === 0
                ? 'bg-slate-900 border-slate-900 text-white shadow-sm'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
          >
            Všechny ({products.length})
          </button>

          <button
            type="button"
            onClick={() => toggleFilter('missing_price')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 ${
              selectedFilters.includes('missing_price')
                ? 'bg-rose-600 border-rose-600 text-white shadow-sm font-extrabold'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-rose-50 hover:text-rose-600'
            }`}
          >
            {selectedFilters.includes('missing_price') && <Check className="w-3 h-3 text-white" />}
            Chybí cena ({countMissingPrice})
          </button>

          <button
            type="button"
            onClick={() => toggleFilter('missing_ean')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 ${
              selectedFilters.includes('missing_ean')
                ? 'bg-rose-600 border-rose-600 text-white shadow-sm font-extrabold'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-rose-50 hover:text-rose-600'
            }`}
          >
            {selectedFilters.includes('missing_ean') && <Check className="w-3 h-3 text-white" />}
            Chybí EAN ({countMissingEan})
          </button>

          <button
            type="button"
            onClick={() => toggleFilter('missing_safety')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 ${
              selectedFilters.includes('missing_safety')
                ? 'bg-rose-600 border-rose-600 text-white shadow-sm font-extrabold'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-rose-50 hover:text-rose-600'
            }`}
          >
            {selectedFilters.includes('missing_safety') && <Check className="w-3 h-3 text-white" />}
            Chybí bezp. ({countMissingSafety})
          </button>

          <button
            type="button"
            onClick={() => toggleFilter('missing_contact')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 ${
              selectedFilters.includes('missing_contact')
                ? 'bg-rose-600 border-rose-600 text-white shadow-sm font-extrabold'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-rose-50 hover:text-rose-600'
            }`}
          >
            {selectedFilters.includes('missing_contact') && <Check className="w-3 h-3 text-white" />}
            Chybí kontakt ({countMissingContact})
          </button>
        </div>

        <div className="flex items-center gap-4 shrink-0 w-full sm:w-auto justify-end">
          {selectedFilters.length > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" />
              Zrušit filtry
            </button>
          )}

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[11px] font-bold text-slate-450 uppercase tracking-wider">Seřadit:</span>
            <select
              value={sortBy}
              onChange={(e: any) => {
                setSortBy(e.target.value);
                setCurrentPage(1);
              }}
              className="text-xs font-semibold text-slate-650 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-indigo-500 transition-all cursor-pointer"
            >
              <option value="updatedAt_desc">Nejnovější (výchozí)</option>
              <option value="name_asc">Název (A-Z)</option>
              <option value="name_desc">Název (Z-A)</option>
              <option value="brand_asc">Značka (A-Z)</option>
              <option value="brand_desc">Značka (Z-A)</option>
              <option value="sku_asc">SKU (A-Z)</option>
              <option value="price_asc">Cena (od nejlevnějšího)</option>
              <option value="price_desc">Cena (od nejdražšího)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Bulk actions bar */}
      {selectedProductIds.length > 0 && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 mb-4 flex items-center justify-between animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-indigo-900">
              Vybráno: <span className="font-extrabold text-indigo-750">{selectedProductIds.length}</span> {selectedProductIds.length === 1 ? 'produkt' : selectedProductIds.length < 5 ? 'produkty' : 'produktů'}
            </span>
            <button
              onClick={() => setSelectedProductIds([])}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-850 bg-white border border-indigo-200 rounded-lg px-2.5 py-1 transition-all"
            >
              Zrušit výběr
            </button>
          </div>
          <button
            onClick={() => setShowBulkDeleteConfirm(true)}
            className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-sm shadow-rose-600/10"
          >
            <Trash2 className="w-4 h-4" />
            Smazat vybrané
          </button>
        </div>
      )}

      {/* Products Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {loading && products.length === 0 ? (
          <div className="py-24 text-center">
            <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-500">Načítání produktů...</p>
          </div>
        ) : products.length === 0 ? (
          <div className="py-20 text-center max-w-sm mx-auto">
            <FileSpreadsheet className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="font-bold text-slate-800 text-lg mb-1">Žádné produkty v katalogu</h3>
            <p className="text-sm text-slate-500 mb-6">
              Váš katalog je prázdný. Nahrajte produkty přes import nebo vytvořte produkt ručně.
            </p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => setShowCreateModal(true)}
                className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-semibold hover:bg-indigo-700"
              >
                Vytvořit produkt
              </button>
              <Link
                href="/import"
                className="border border-slate-200 text-slate-650 px-4 py-2 rounded-xl text-xs font-semibold hover:bg-slate-50"
              >
                Importovat soubor
              </Link>
            </div>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="py-20 text-center max-w-sm mx-auto">
            <AlertCircle className="w-12 h-12 text-slate-350 mx-auto mb-4" />
            <h3 className="font-bold text-slate-800 text-lg mb-1">Žádné výsledky</h3>
            <p className="text-sm text-slate-500 mb-4">
              Žádné produkty neodpovídají zvoleným filtrům kvality dat.
            </p>
            <button
              onClick={clearFilters}
              className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold px-4 py-2 rounded-xl transition-all"
            >
              Zrušit filtry
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-semibold text-xs border-b border-slate-100 uppercase tracking-wider">
                  <th className="pl-6 pr-2 py-4 w-10">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 text-indigo-650 focus:ring-indigo-500 w-4.5 h-4.5 cursor-pointer"
                      checked={paginatedProducts.length > 0 && paginatedProducts.every(p => selectedProductIds.includes(p.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          const pageIds = paginatedProducts.map(p => p.id);
                          setSelectedProductIds(prev => {
                            const combined = [...prev, ...pageIds];
                            return Array.from(new Set(combined));
                          });
                        } else {
                          const pageIds = paginatedProducts.map(p => p.id);
                          setSelectedProductIds(prev => prev.filter(id => !pageIds.includes(id)));
                        }
                      }}
                    />
                  </th>
                  <th className="px-6 py-4">SKU / Kód</th>
                  <th className="px-6 py-4">Název produktu</th>
                  <th className="px-6 py-4">Značka</th>
                  <th className="px-6 py-4 text-right">Cena</th>
                  <th className="px-6 py-4">EAN</th>
                  <th className="px-6 py-4 text-right">Akce</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedProducts.map((prod) => (
                  <tr key={prod.id} className={`hover:bg-slate-50/40 transition-colors group ${selectedProductIds.includes(prod.id) ? 'bg-indigo-50/20 hover:bg-indigo-50/30' : ''}`}>
                    <td className="pl-6 pr-2 py-4 w-10">
                      <input
                        type="checkbox"
                        className="rounded border-slate-300 text-indigo-650 focus:ring-indigo-500 w-4.5 h-4.5 cursor-pointer"
                        checked={selectedProductIds.includes(prod.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedProductIds(prev => [...prev, prod.id]);
                          } else {
                            setSelectedProductIds(prev => prev.filter(id => id !== prod.id));
                          }
                        }}
                      />
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-mono text-xs font-bold bg-slate-100 text-slate-700 px-2 py-1 rounded-md">
                        {prod.sku}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-semibold text-slate-900">
                      <div className="flex items-center gap-2">
                        <span>{prod.name}</span>
                        {(!prod.safetyText || !prod.contactText) && (
                          <div className="flex gap-1 shrink-0">
                            {!prod.safetyText && (
                              <span className="text-[9px] font-bold bg-amber-50 border border-amber-100 text-amber-800 px-1.5 py-0.5 rounded whitespace-nowrap" title="Chybí bezpečnostní text">Chybí bezp.</span>
                            )}
                            {!prod.contactText && (
                              <span className="text-[9px] font-bold bg-amber-50 border border-amber-100 text-amber-800 px-1.5 py-0.5 rounded whitespace-nowrap" title="Chybí kontaktní údaje">Chybí kontakt</span>
                            )}
                          </div>
                        )}
                      </div>
                      {prod.note && (
                        <span className="block text-[10px] text-slate-400 font-normal mt-0.5">
                          Pozn: {prod.note}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-500">{prod.brand || '-'}</td>
                    <td className="px-6 py-4 text-right font-bold">
                      {prod.price !== null && prod.price > 0 ? (
                        <span className="text-slate-900">{prod.price} Kč</span>
                      ) : (
                        <span className="text-rose-700 text-[10px] font-bold bg-rose-50 border border-rose-100 px-2.5 py-0.5 rounded-full inline-block whitespace-nowrap">Chybí cena</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-xs">
                      {prod.ean ? (
                        <span className="text-slate-500 text-xs font-mono">{prod.ean}</span>
                      ) : (
                        <span className="text-rose-700 text-[10px] font-bold bg-rose-50 border border-rose-100 px-2.5 py-0.5 rounded-full inline-block whitespace-nowrap">Chybí EAN</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => {
                            invalidateAiProposal();
                            setEditingProduct(prod);
                          }}
                          title="Upravit produkt"
                          className="p-1.5 hover:bg-slate-100 text-slate-600 hover:text-indigo-600 rounded-lg transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setShowDeleteConfirm(prod.id)}
                          title="Smazat produkt"
                          className="p-1.5 hover:bg-rose-50 text-slate-600 hover:text-rose-600 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination Controls */}
            {filteredProducts.length > 0 && (
              <div className="bg-slate-50/50 px-6 py-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                {/* Left side: Items per page selector & Total stats */}
                <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-500">
                  <div className="flex items-center gap-2">
                    <span>Zobrazit:</span>
                    <select
                      value={itemsPerPage}
                      onChange={(e) => {
                        const val = e.target.value;
                        setItemsPerPage(val === 'all' ? 'all' : Number(val));
                        setCurrentPage(1);
                      }}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-750 font-bold focus:outline-none focus:border-indigo-500 cursor-pointer shadow-xs"
                    >
                      <option value={20}>20 na stránku</option>
                      <option value={50}>50 na stránku</option>
                      <option value={100}>100 na stránku</option>
                      <option value="all">Všechny</option>
                    </select>
                  </div>
                  <div className="h-4 w-px bg-slate-200" />
                  <div>
                    Zobrazeno {startItem}–{endItem} z {filteredProducts.length} produktů
                  </div>
                </div>

                {/* Right side: Page navigation */}
                {totalPages > 1 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={currentPage === 1}
                      onClick={() => handlePageChange(currentPage - 1)}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all select-none mr-1"
                    >
                      Předchozí
                    </button>

                    {getPageNumbers().map((pageNum, idx) => {
                      if (pageNum === '...') {
                        return (
                          <span key={`ellipsis-${idx}`} className="px-2 py-1 text-xs text-slate-400 font-bold select-none">
                            ...
                          </span>
                        );
                      }

                      const page = pageNum as number;
                      const isCurrent = page === currentPage;

                      return (
                        <button
                          key={`page-${page}`}
                          type="button"
                          onClick={() => handlePageChange(page)}
                          className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold transition-all select-none border ${
                            isCurrent
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-600/10'
                              : 'bg-white text-slate-650 hover:bg-slate-50 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {page}
                        </button>
                      );
                    })}

                    <button
                      type="button"
                      disabled={currentPage === totalPages}
                      onClick={() => handlePageChange(currentPage + 1)}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all select-none ml-1"
                    >
                      Další
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* EDIT MODAL */}
      {editingProduct && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-bold text-lg">Upravit detaily produktu</h3>
                <p className="text-xs text-slate-400 mt-0.5">ID: {editingProduct.id.substring(0, 8)}...</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  invalidateAiProposal();
                  setEditingProduct(null);
                }}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-650 mb-1 uppercase tracking-wider">SKU / Kód produktu *</label>
                  <input
                    type="text"
                    required
                    value={editingProduct.sku}
                    onChange={(e) => setEditingProduct({ ...editingProduct, sku: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-650 mb-1 uppercase tracking-wider">Název produktu *</label>
                  <input
                    type="text"
                    required
                    value={editingProduct.name}
                    onChange={(e) => {
                      invalidateAiProposal();
                      setEditingProduct({ ...editingProduct, name: e.target.value });
                    }}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-650 mb-1 uppercase tracking-wider">Značka</label>
                  <input
                    type="text"
                    value={editingProduct.brand || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, brand: e.target.value || null })}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-650 mb-1 uppercase tracking-wider">Cena (Kč)</label>
                  <input
                    type="number"
                    step="any"
                    value={editingProduct.price !== null ? editingProduct.price : ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, price: e.target.value ? Number(e.target.value) : null })}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-650 mb-1 uppercase tracking-wider">Čárový kód (EAN)</label>
                  <input
                    type="text"
                    value={editingProduct.ean || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, ean: e.target.value || null })}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-650 mb-1 uppercase tracking-wider">Poznámka (interní)</label>
                  <input
                    type="text"
                    value={editingProduct.note || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, note: e.target.value || null })}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-650 mb-1 uppercase tracking-wider">Popis produktu (podklad pro AI klasifikaci)</label>
                <textarea
                  rows={3}
                  placeholder="Popis produktu z e-shopu nebo ruční upřesnění typu výrobku..."
                  value={editingProduct.description || ''}
                  onChange={(e) => {
                    invalidateAiProposal();
                    setEditingProduct({ ...editingProduct, description: e.target.value || null });
                  }}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <label className="block text-xs font-bold text-slate-650 uppercase tracking-wider">Bezpečnostní informace</label>
                  <button
                    type="button"
                    data-testid="ai-suggest-btn-edit"
                    disabled={aiLoadingTarget === `edit:${editingProduct.id}` || !editingProduct.name.trim()}
                    onClick={() =>
                      handleRequestAiSafety(
                        `edit:${editingProduct.id}`,
                        editingProduct.name,
                        editingProduct.description || ''
                      )
                    }
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-1 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    Navrhnout bezpečnostní text
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={editingProduct.safetyText || ''}
                  onChange={(e) => setEditingProduct({ ...editingProduct, safetyText: e.target.value || null })}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
                {renderAiSafetyAssistant({
                  targetKey: `edit:${editingProduct.id}`,
                  currentName: editingProduct.name,
                  currentDescription: editingProduct.description || '',
                  currentSafetyText: editingProduct.safetyText || '',
                  onApplySafetyText: (newText) =>
                    setEditingProduct((prev) => (prev ? { ...prev, safetyText: newText } : null)),
                })}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-650 mb-1 uppercase tracking-wider">Kontaktní údaje (Distributor)</label>
                <textarea
                  rows={3}
                  value={editingProduct.contactText || ''}
                  onChange={(e) => setEditingProduct({ ...editingProduct, contactText: e.target.value || null })}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    invalidateAiProposal();
                    setEditingProduct(null);
                  }}
                  className="text-sm font-semibold text-slate-550 px-4 py-2 hover:bg-slate-50 border border-slate-150 rounded-xl"
                >
                  Zrušit
                </button>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-5 py-2 rounded-xl"
                >
                  Uložit změny
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-bold text-lg">Nový produkt</h3>
                <p className="text-xs text-slate-400 mt-0.5">Vytvoření nové karty produktu do katalogu</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  invalidateAiProposal();
                  setShowCreateModal(false);
                }}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-650 mb-1 uppercase tracking-wider">SKU / Kód produktu *</label>
                  <input
                    type="text"
                    required
                    placeholder="Např: SPK-001"
                    value={newProductForm.sku}
                    onChange={(e) => setNewProductForm({ ...newProductForm, sku: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-650 mb-1 uppercase tracking-wider">Název produktu *</label>
                  <input
                    type="text"
                    required
                    placeholder="Např: Čisticí utěrky univerzální"
                    value={newProductForm.name}
                    onChange={(e) => {
                      invalidateAiProposal();
                      setNewProductForm({ ...newProductForm, name: e.target.value });
                    }}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-650 mb-1 uppercase tracking-wider">Značka</label>
                  <input
                    type="text"
                    placeholder="Např: Výrobce s.r.o."
                    value={newProductForm.brand}
                    onChange={(e) => setNewProductForm({ ...newProductForm, brand: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-650 mb-1 uppercase tracking-wider">Cena (Kč)</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="Např: 149"
                    value={newProductForm.price}
                    onChange={(e) => setNewProductForm({ ...newProductForm, price: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-650 mb-1 uppercase tracking-wider">Čárový kód (EAN)</label>
                  <input
                    type="text"
                    placeholder="Např: 8590000000000"
                    value={newProductForm.ean}
                    onChange={(e) => setNewProductForm({ ...newProductForm, ean: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-650 mb-1 uppercase tracking-wider">Poznámka (interní)</label>
                  <input
                    type="text"
                    placeholder="Interní info"
                    value={newProductForm.note}
                    onChange={(e) => setNewProductForm({ ...newProductForm, note: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-650 mb-1 uppercase tracking-wider">Popis produktu (podklad pro AI klasifikaci)</label>
                <textarea
                  rows={3}
                  placeholder="Popis produktu z e-shopu nebo ruční upřesnění typu výrobku..."
                  value={newProductForm.description}
                  onChange={(e) => {
                    invalidateAiProposal();
                    setNewProductForm({ ...newProductForm, description: e.target.value });
                  }}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <label className="block text-xs font-bold text-slate-650 uppercase tracking-wider">Bezpečnostní informace</label>
                  <button
                    type="button"
                    data-testid="ai-suggest-btn-create"
                    disabled={aiLoadingTarget === 'create' || !newProductForm.name.trim()}
                    onClick={() =>
                      handleRequestAiSafety('create', newProductForm.name, newProductForm.description)
                    }
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-1 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    Navrhnout bezpečnostní text
                  </button>
                </div>
                <textarea
                  rows={3}
                  placeholder="Bezpečnostní pokyny pro tisk na štítek..."
                  value={newProductForm.safetyText}
                  onChange={(e) => setNewProductForm({ ...newProductForm, safetyText: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
                {renderAiSafetyAssistant({
                  targetKey: 'create',
                  currentName: newProductForm.name,
                  currentDescription: newProductForm.description,
                  currentSafetyText: newProductForm.safetyText,
                  onApplySafetyText: (newText) =>
                    setNewProductForm((prev) => ({ ...prev, safetyText: newText })),
                })}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-650 mb-1 uppercase tracking-wider">Kontaktní údaje (Distributor)</label>
                <textarea
                  rows={3}
                  placeholder="Např: Distributor s.r.o.&#10;www.distributor.cz&#10;tel: +420 123 456&#10;info@distributor.cz"
                  value={newProductForm.contactText}
                  onChange={(e) => setNewProductForm({ ...newProductForm, contactText: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    invalidateAiProposal();
                    setShowCreateModal(false);
                  }}
                  className="text-sm font-semibold text-slate-550 px-4 py-2 hover:bg-slate-50 border border-slate-150 rounded-xl"
                >
                  Zrušit
                </button>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-5 py-2 rounded-xl"
                >
                  Přidat produkt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRM MODAL */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl p-6 border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-rose-600 mb-4">
              <Trash2 className="w-6 h-6 shrink-0" />
              <h3 className="font-bold text-lg">Smazat produkt?</h3>
            </div>
            <p className="text-sm text-slate-500 mb-6">
              Opravdu si přejete smazat tento produkt z katalogu? Tato akce je nevratná.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(null)}
                className="text-sm font-semibold text-slate-500 px-4 py-2 hover:bg-slate-50 border border-slate-200 rounded-xl"
              >
                Storno
              </button>
              <button
                onClick={() => handleDeleteExecute(showDeleteConfirm)}
                className="bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold px-5 py-2 rounded-xl"
              >
                Smazat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BULK DELETE CONFIRM MODAL */}
      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl p-6 border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-rose-600 mb-4">
              <Trash2 className="w-6 h-6 shrink-0" />
              <h3 className="font-bold text-lg">Smazat vybrané produkty?</h3>
            </div>
            <p className="text-sm text-slate-500 mb-6">
              Opravdu si přejete hromadně smazat vybrané produkty ({selectedProductIds.length}) z katalogu? Tato akce je nevratná.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowBulkDeleteConfirm(false)}
                className="text-sm font-semibold text-slate-500 px-4 py-2 hover:bg-slate-50 border border-slate-200 rounded-xl"
              >
                Storno
              </button>
              <button
                onClick={handleBulkDeleteExecute}
                className="bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold px-5 py-2 rounded-xl"
              >
                Smazat vše
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
