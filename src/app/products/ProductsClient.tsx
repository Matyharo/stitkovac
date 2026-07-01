'use client';

import React, { useState, useEffect, useTransition } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  getProducts,
  updateProduct,
  deleteProduct,
  createProduct,
  deleteProducts
} from '@/app/actions';
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  AlertCircle,
  Check,
  RefreshCw,
  X,
  FileSpreadsheet,
  HelpCircle,
  Tag
} from 'lucide-react';

interface Product {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  price: number | null;
  safetyText: string | null;
  contactText: string | null;
  ean: string | null;
  note: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
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
    brand: '',
    price: '',
    safetyText: '',
    contactText: '',
    ean: '',
    note: '',
  });

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
      brand: editingProduct.brand,
      price: isNaN(Number(priceNum)) ? null : priceNum,
      safetyText: editingProduct.safetyText,
      contactText: editingProduct.contactText,
      ean: editingProduct.ean,
      note: editingProduct.note,
    });

    if (res.success) {
      setSuccessMessage(`Produkt "${editingProduct.name}" byl úspěšně upraven.`);
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
      brand: newProductForm.brand || null,
      price: priceNum && !isNaN(priceNum) ? priceNum : null,
      safetyText: newProductForm.safetyText || null,
      contactText: newProductForm.contactText || null,
      ean: newProductForm.ean || null,
      note: newProductForm.note || null,
    });

    if (res.success) {
      setSuccessMessage(`Produkt "${newProductForm.name}" byl přidán.`);
      setShowCreateModal(false);
      setNewProductForm({
        sku: '',
        name: '',
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
            onClick={() => setShowCreateModal(true)}
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
                          onClick={() => setEditingProduct(prod)}
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
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg">Upravit detaily produktu</h3>
                <p className="text-xs text-slate-400 mt-0.5">ID: {editingProduct.id.substring(0, 8)}...</p>
              </div>
              <button
                onClick={() => setEditingProduct(null)}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
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
                    onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
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
                  <label className="block text-xs font-bold text-slate-650 mb-1 uppercase tracking-wider">Poznámka</label>
                  <input
                    type="text"
                    value={editingProduct.note || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, note: e.target.value || null })}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-650 mb-1 uppercase tracking-wider">Bezpečnostní informace</label>
                <textarea
                  rows={2}
                  value={editingProduct.safetyText || ''}
                  onChange={(e) => setEditingProduct({ ...editingProduct, safetyText: e.target.value || null })}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
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
                  onClick={() => setEditingProduct(null)}
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
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg">Nový produkt</h3>
                <p className="text-xs text-slate-400 mt-0.5">Vytvoření nové karty produktu do katalogu</p>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4">
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
                    onChange={(e) => setNewProductForm({ ...newProductForm, name: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-650 mb-1 uppercase tracking-wider">Značka</label>
                  <input
                    type="text"
                    placeholder="Např: Spoko"
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
                  <label className="block text-xs font-bold text-slate-650 mb-1 uppercase tracking-wider">Poznámka</label>
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
                <label className="block text-xs font-bold text-slate-650 mb-1 uppercase tracking-wider">Bezpečnostní informace</label>
                <textarea
                  rows={2}
                  placeholder="Bezpečnostní pokyny pro tisk na štítek..."
                  value={newProductForm.safetyText}
                  onChange={(e) => setNewProductForm({ ...newProductForm, safetyText: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-650 mb-1 uppercase tracking-wider">Kontaktní údaje (Distributor)</label>
                <textarea
                  rows={3}
                  placeholder="Např: Spoko s.r.o.&#10;www.spoko.cz&#10;tel: +420 123 456&#10;info@spoko.cz"
                  value={newProductForm.contactText}
                  onChange={(e) => setNewProductForm({ ...newProductForm, contactText: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
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
