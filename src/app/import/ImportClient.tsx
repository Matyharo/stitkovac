'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CsvImporter } from '@/lib/importers/CsvImporter';
import { XlsxImporter } from '@/lib/importers/XlsxImporter';
import { findBestHeader } from '@/lib/importers/ProductImporter';
import { saveImportedProducts, analyzeImportedProducts } from '@/app/actions';
import {
  Upload,
  AlertCircle,
  Check,
  FileSpreadsheet,
  ArrowRight,
  Database,
  RefreshCw,
  X,
  AlertTriangle,
  PlusCircle,
  Pencil,
  Info,
  TrendingUp,
  TrendingDown,
  Settings
} from 'lucide-react';

interface MappingState {
  sku: string;
  name: string;
  brand: string;
  price: string;
  safetyText: string;
  contactText: string;
  ean: string;
  note: string;
}

export default function ImportPage() {
  const router = useRouter();

  // Step state: 1 = upload, 2 = map columns, 3 = preview & save
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Analysis & Validation Report State
  const [analysis, setAnalysis] = useState<any | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'new' | 'updates' | 'warnings'>('all');

  // Parsing result
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);

  // Mapping configurations
  const [mapping, setMapping] = useState<MappingState>({
    sku: '',
    name: '',
    brand: '',
    price: '',
    safetyText: '',
    contactText: '',
    ean: '',
    note: '',
  });

  const [overwriteConfig, setOverwriteConfig] = useState({
    name: true,
    brand: true,
    price: true,
    safetyText: true,
    contactText: true,
    ean: true,
    note: true,
  });
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setError(null);
    setLoading(true);

    try {
      const extension = selectedFile.name.split('.').pop()?.toLowerCase();
      let importer;

      if (extension === 'csv') {
        importer = new CsvImporter();
      } else if (extension === 'xlsx' || extension === 'xls') {
        importer = new XlsxImporter();
      } else {
        throw new Error('Nepodporovaný formát souboru. Nahrajte prosím .csv, .xlsx nebo .xls.');
      }

      const result = await importer.parse(selectedFile);

      if (!result.success) {
        throw new Error(result.error || 'Nepodařilo se načíst data ze souboru.');
      }

      if (result.rows.length === 0) {
        throw new Error('Soubor neobsahuje žádné datové řádky k importu.');
      }

      setHeaders(result.headers);
      setRawRows(result.rows);

      // Perform auto-mapping heuristics
      const autoMapping: MappingState = {
        sku: findBestHeader(result.headers, ['sku', 'kód', 'kod', 'id', 'product code', 'kód zboží']),
        name: findBestHeader(result.headers, ['name', 'název', 'nazev', 'produkt', 'product', 'titul']),
        brand: findBestHeader(result.headers, ['brand', 'značka', 'znacka', 'výrobce', 'vyrobce', 'dodavatel']),
        price: findBestHeader(result.headers, ['price', 'cena', 'částka', 'castka']),
        safetyText: findBestHeader(result.headers, ['safety', 'bezpečnost', 'bezpecnost', 'varování', 'safety text']),
        contactText: findBestHeader(result.headers, ['contact', 'kontakt', 'distributor', 'adresa']),
        ean: findBestHeader(result.headers, ['ean', 'čárový kód', 'bar code', 'barcode']),
        note: findBestHeader(result.headers, ['note', 'poznámka', 'poznamka', 'popis']),
      };

      setMapping(autoMapping);
      setStep(2);
    } catch (err: any) {
      setError(err.message || 'Nastala chyba při zpracování souboru.');
      setFile(null);
    } finally {
      setLoading(false);
    }
  };


  // Convert mapping configurations to preview dataset
  const getMappedProducts = () => {
    return rawRows.map((row) => {
      // Parse price to float
      const rawPrice = mapping.price ? row[mapping.price] : '';
      // Clean price string (remove spaces, replace commas, etc)
      const cleanPriceStr = rawPrice ? rawPrice.replace(/[^\d.,]/g, '').replace(',', '.') : '';
      const priceNum = cleanPriceStr ? parseFloat(cleanPriceStr) : undefined;

      return {
        sku: mapping.sku ? row[mapping.sku] || '' : '',
        name: mapping.name ? row[mapping.name] || '' : '',
        brand: mapping.brand ? row[mapping.brand] || '' : '',
        price: priceNum,
        safetyText: mapping.safetyText ? row[mapping.safetyText] || '' : '',
        contactText: mapping.contactText ? row[mapping.contactText] || '' : '',
        ean: mapping.ean ? row[mapping.ean] || '' : '',
        note: mapping.note ? row[mapping.note] || '' : '',
      };
    });
  };

  // Proceed to Step 3: Preview mapped data & analysis report
  const handleProceedToPreview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mapping.sku || !mapping.name) {
      setError('Kód (SKU) a Název jsou povinná pole a musí být namapována.');
      return;
    }
    setError(null);
    setAnalyzing(true);
    try {
      const mapped = getMappedProducts();
      const valid = mapped.filter((p) => p.sku && p.name);
      
      const res = await analyzeImportedProducts(valid);
      if (res.success) {
        setAnalysis(res);
        // Default tab selection heuristics
        if (res.warnings && res.warnings.length > 0) {
          setActiveTab('warnings');
        } else if (res.updatedProducts && res.updatedProducts.length > 0) {
          setActiveTab('updates');
        } else if (res.newProducts && res.newProducts.length > 0) {
          setActiveTab('new');
        } else {
          setActiveTab('all');
        }
        setStep(3);
      } else {
        throw new Error(res.error || 'Chyba při analýze importu.');
      }
    } catch (err: any) {
      setError(err.message || 'Nepodařilo se provést analýzu importu.');
    } finally {
      setAnalyzing(false);
    }
  };

  // Finalize import and save to SQLite DB
  const handleFinalizeImport = async () => {
    setLoading(true);
    setError(null);
    try {
      const mapped = getMappedProducts();
      // Filter out invalid items (must have sku and name)
      const valid = mapped.filter((p) => p.sku && p.name);

      if (valid.length === 0) {
        throw new Error('Žádné platné produkty k uložení. Zkontrolujte namapování polí.');
      }

      const res = await saveImportedProducts(valid, overwriteConfig);

      if (res.success) {
        // Redirect to products page
        router.push(`/products?importSuccess=true&imported=${res.importedCount}&updated=${res.updatedCount}`);
      } else {
        throw new Error(res.error || 'Došlo k chybě při zápisu do databáze.');
      }
    } catch (err: any) {
      setError(err.message || 'Nepodařilo se dokončit import.');
      setLoading(false);
    }
  };

  const resetImport = () => {
    setFile(null);
    setHeaders([]);
    setRawRows([]);
    setStep(1);
    setError(null);
    setAnalysis(null);
    setOverwriteConfig({
      name: true,
      brand: true,
      price: true,
      safetyText: true,
      contactText: true,
      ean: true,
      note: true,
    });
  };

  const mappedProductsPreview = getMappedProducts().slice(0, 5);

  return (
    <div className="flex-1 p-8 max-w-5xl mx-auto w-full">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
          Import produktů
        </h1>
        <p className="text-slate-500 mt-1">
          Nahrajte katalog produktů ve formátu Excel (.xlsx) nebo CSV a namapujte jeho sloupce do databáze.
        </p>
      </div>

      {/* Progress Steps Indicators */}
      <div className="flex items-center gap-4 mb-8 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
        <div className={`flex items-center gap-2 text-sm font-semibold ${step >= 1 ? 'text-indigo-600' : 'text-slate-400'}`}>
          <span className={`w-6 h-6 rounded-full flex items-center justify-center border text-xs font-bold ${
            step > 1 ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-indigo-600'
          }`}>1</span>
          Soubor
        </div>
        <ArrowRight className="w-4 h-4 text-slate-300" />
        <div className={`flex items-center gap-2 text-sm font-semibold ${step >= 2 ? 'text-indigo-600' : 'text-slate-400'}`}>
          <span className={`w-6 h-6 rounded-full flex items-center justify-center border text-xs font-bold ${
            step > 2 ? 'bg-indigo-600 border-indigo-600 text-white' : step === 2 ? 'border-indigo-600' : 'border-slate-300'
          }`}>2</span>
          Mapování
        </div>
        <ArrowRight className="w-4 h-4 text-slate-300" />
        <div className={`flex items-center gap-2 text-sm font-semibold ${step >= 3 ? 'text-indigo-600' : 'text-slate-400'}`}>
          <span className={`w-6 h-6 rounded-full flex items-center justify-center border text-xs font-bold ${
            step === 3 ? 'border-indigo-600' : 'border-slate-300'
          }`}>3</span>
          Náhled a uložení
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-100 text-rose-800 rounded-xl flex items-start gap-3 text-sm font-medium animate-in fade-in slide-in-from-top-2 duration-200">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
          <div className="flex-1">
            <p>{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* STEP 1: UPLOAD FILE */}
      {step === 1 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center">
          <div className="max-w-md mx-auto">
            <div className="mx-auto w-16 h-16 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center mb-4 border border-slate-100">
              <Upload className="w-7 h-7 text-indigo-500" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-1">Nahrát produktový soubor</h3>
            <p className="text-sm text-slate-500 mb-6 leading-relaxed">
              Podporujeme XLSX, XLS nebo CSV tabulky exportované z jakéhokoli e-shopu či účetnictví.
            </p>

            <label className="relative flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-slate-200 hover:border-indigo-500 hover:bg-indigo-50/10 rounded-2xl cursor-pointer transition-all duration-300 group">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                {loading ? (
                  <>
                    <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mb-2" />
                    <p className="text-xs font-semibold text-indigo-600">Čtení dat z tabulky...</p>
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="w-8 h-8 text-slate-300 group-hover:text-indigo-500 transition-colors mb-2" />
                    <p className="text-sm font-bold text-slate-600 group-hover:text-indigo-600 transition-colors">
                      Vyberte soubor na disku
                    </p>
                    <p className="text-xs text-slate-400 mt-1">Nebo jej přetáhněte sem</p>
                  </>
                )}
              </div>
              <input
                type="file"
                className="hidden"
                accept=".csv, .xlsx, .xls"
                onChange={handleFileChange}
                disabled={loading}
              />
            </label>
          </div>
        </div>
      )}

      {/* STEP 2: COLUMN MAPPING */}
      {step === 2 && (
        <form onSubmit={handleProceedToPreview} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
            <div>
              <h3 className="font-bold text-lg text-slate-900">Spárování sloupců tabulky</h3>
              <p className="text-xs text-slate-500">
                Přiřaďte sloupce z nahraného souboru k polím v naší lokální databázi.
              </p>
            </div>
            <button
              type="button"
              onClick={resetImport}
              className="text-xs font-semibold text-slate-400 hover:text-slate-600 px-3 py-1.5 border border-slate-100 hover:border-slate-200 rounded-lg"
            >
              Zrušit nahrávání
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Required fields group */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Povinné údaje o produktu
              </h4>

              {/* SKU mapping */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Kód produktu (SKU) <span className="text-rose-500">*</span>
                </label>
                <select
                  value={mapping.sku}
                  onChange={(e) => setMapping({ ...mapping, sku: e.target.value })}
                  required
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="">-- Vyberte sloupec --</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              {/* Name mapping */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Název produktu <span className="text-rose-500">*</span>
                </label>
                <select
                  value={mapping.name}
                  onChange={(e) => setMapping({ ...mapping, name: e.target.value })}
                  required
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="">-- Vyberte sloupec --</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              {/* Price mapping */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Cena produktu (Kč)
                </label>
                <select
                  value={mapping.price}
                  onChange={(e) => setMapping({ ...mapping, price: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="">-- Ignorovat / Nevybráno --</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              {/* Brand mapping */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Značka / Výrobce
                </label>
                <select
                  value={mapping.brand}
                  onChange={(e) => setMapping({ ...mapping, brand: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="">-- Ignorovat / Nevybráno --</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Optional fields group */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Štítkové doplňující informace
              </h4>

              {/* Safety text mapping */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Bezpečnostní text
                </label>
                <select
                  value={mapping.safetyText}
                  onChange={(e) => setMapping({ ...mapping, safetyText: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="">-- Ignorovat / Nevybráno --</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              {/* Contact text mapping */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Kontakt na distributora
                </label>
                <select
                  value={mapping.contactText}
                  onChange={(e) => setMapping({ ...mapping, contactText: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="">-- Ignorovat / Nevybráno --</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              {/* EAN mapping */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Čárový kód (EAN)
                </label>
                <select
                  value={mapping.ean}
                  onChange={(e) => setMapping({ ...mapping, ean: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="">-- Ignorovat / Nevybráno --</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              {/* Note mapping */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Interní poznámka
                </label>
                <select
                  value={mapping.note}
                  onChange={(e) => setMapping({ ...mapping, note: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="">-- Ignorovat / Nevybráno --</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-100 flex justify-end gap-3">
            <button
              type="submit"
              disabled={analyzing}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-semibold transition-all duration-200 disabled:opacity-50"
            >
              {analyzing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Analyzuji data...
                </>
              ) : (
                <>
                  Pokračovat na náhled
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* STEP 3: PREVIEW & SAVE */}
      {step === 3 && analysis && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-6 animate-in fade-in duration-200">
          <div>
            <h3 className="font-bold text-lg text-slate-900">Zkontrolovat analýzu importu</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Před provedením zápisu do databáze zkontrolujte zjištěné změny a případná varování.
            </p>
          </div>

          {/* Statistics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* New Products Card */}
            <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-4 flex items-center gap-3">
              <div className="p-2.5 bg-emerald-500 text-white rounded-xl">
                <PlusCircle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider font-bold text-emerald-600">Nové položky</p>
                <p className="text-xl font-extrabold text-emerald-950 mt-0.5">
                  {analysis.newProducts?.length || 0}
                </p>
              </div>
            </div>

            {/* Updates Card */}
            <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-4 flex items-center gap-3">
              <div className="p-2.5 bg-indigo-500 text-white rounded-xl">
                <Pencil className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider font-bold text-indigo-600">Aktualizace</p>
                <p className="text-xl font-extrabold text-indigo-950 mt-0.5">
                  {analysis.updatedProducts?.length || 0}
                </p>
              </div>
            </div>

            {/* Unchanged Card */}
            <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 flex items-center gap-3">
              <div className="p-2.5 bg-slate-500 text-white rounded-xl">
                <Check className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Beze změn</p>
                <p className="text-xl font-extrabold text-slate-950 mt-0.5">
                  {analysis.unchangedCount || 0}
                </p>
              </div>
            </div>

            {/* Warnings Card */}
            <div className={`rounded-2xl p-4 flex items-center gap-3 border ${
              analysis.warnings?.length > 0 
                ? 'bg-amber-50/50 border-amber-200' 
                : 'bg-slate-50 border-slate-200/60 opacity-60'
            }`}>
              <div className={`p-2.5 rounded-xl ${
                analysis.warnings?.length > 0 ? 'bg-amber-500 text-white' : 'bg-slate-400 text-white'
              }`}>
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <p className={`text-[10px] uppercase tracking-wider font-bold ${
                  analysis.warnings?.length > 0 ? 'text-amber-600' : 'text-slate-500'
                }`}>Varování / Chyby</p>
                <p className="text-xl font-extrabold text-slate-950 mt-0.5">
                  {analysis.warnings?.length || 0}
                </p>
              </div>
            </div>
          </div>

          {/* Tab Selection Bar */}
          <div className="flex border-b border-slate-100 overflow-x-auto gap-2 scrollbar-none">
            <button
              onClick={() => setActiveTab('all')}
              className={`pb-3 text-xs font-bold transition-all px-2.5 border-b-2 whitespace-nowrap ${
                activeTab === 'all' 
                  ? 'border-indigo-600 text-indigo-650' 
                  : 'border-transparent text-slate-450 hover:text-slate-650'
              }`}
            >
              Všechna importovaná data ({rawRows.length})
            </button>
            <button
              onClick={() => setActiveTab('new')}
              className={`pb-3 text-xs font-bold transition-all px-2.5 border-b-2 whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'new' 
                  ? 'border-emerald-600 text-emerald-650' 
                  : 'border-transparent text-slate-450 hover:text-slate-650'
              }`}
            >
              Nové produkty ({analysis.newProducts?.length || 0})
            </button>
            <button
              onClick={() => setActiveTab('updates')}
              className={`pb-3 text-xs font-bold transition-all px-2.5 border-b-2 whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'updates' 
                  ? 'border-indigo-600 text-indigo-650' 
                  : 'border-transparent text-slate-450 hover:text-slate-650'
              }`}
            >
              Aktualizované hodnoty ({analysis.updatedProducts?.length || 0})
            </button>
            <button
              onClick={() => setActiveTab('warnings')}
              className={`pb-3 text-xs font-bold transition-all px-2.5 border-b-2 whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'warnings' 
                  ? 'border-amber-500 text-amber-650' 
                  : 'border-transparent text-slate-450 hover:text-slate-650'
              }`}
            >
              Varování a anomálie
              {analysis.warnings?.length > 0 && (
                <span className="bg-amber-100 text-amber-750 px-2 py-0.5 rounded-full text-[10px] font-extrabold animate-pulse">
                  {analysis.warnings.length}
                </span>
              )}
            </button>
          </div>

          {/* TAB 1: ALL DATA */}
          {activeTab === 'all' && (
            <div className="border border-slate-105 rounded-xl overflow-hidden bg-slate-50/50 animate-in fade-in duration-150">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100/80 text-slate-600 uppercase tracking-wider font-bold border-b border-slate-200">
                      <th className="px-4 py-3">SKU / Kód</th>
                      <th className="px-4 py-3">Název produktu</th>
                      <th className="px-4 py-3">Značka</th>
                      <th className="px-4 py-3 text-right">Cena</th>
                      <th className="px-4 py-3">Bezpečnostní text</th>
                      <th className="px-4 py-3">Kontakt</th>
                      <th className="px-4 py-3">EAN</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {getMappedProducts().slice(0, 15).map((prod, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-semibold text-slate-700">{prod.sku || <span className="text-rose-450 italic">Prázdné</span>}</td>
                        <td className="px-4 py-3 font-semibold text-slate-900 max-w-[200px] truncate">{prod.name || <span className="text-rose-450 italic">Prázdné</span>}</td>
                        <td className="px-4 py-3 text-slate-500">{prod.brand || '-'}</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900">{prod.price !== undefined ? `${prod.price} Kč` : '-'}</td>
                        <td className="px-4 py-3 text-slate-500 max-w-[150px] truncate">{prod.safetyText || '-'}</td>
                        <td className="px-4 py-3 text-slate-500 max-w-[150px] truncate">{prod.contactText || '-'}</td>
                        <td className="px-4 py-3 text-slate-500">{prod.ean || '-'}</td>
                      </tr>
                    ))}
                    {rawRows.length > 15 && (
                      <tr className="bg-slate-50/30">
                        <td colSpan={7} className="px-4 py-3 text-center text-slate-400 italic">
                          ... a dalších {rawRows.length - 15} položek v importu ...
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: NEW PRODUCTS */}
          {activeTab === 'new' && (
            <div className="border border-slate-105 rounded-xl overflow-hidden bg-slate-50/50 animate-in fade-in duration-150">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100/80 text-slate-600 uppercase tracking-wider font-bold border-b border-slate-200">
                      <th className="px-4 py-3">SKU / Kód</th>
                      <th className="px-4 py-3">Název produktu</th>
                      <th className="px-4 py-3">Značka</th>
                      <th className="px-4 py-3 text-right">Cena</th>
                      <th className="px-4 py-3">EAN</th>
                      <th className="px-4 py-3 text-right">Typ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {analysis.newProducts.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-400 italic">
                          Tento import neobsahuje žádné nové produkty (všechny produkty již v databázi existují).
                        </td>
                      </tr>
                    ) : (
                      analysis.newProducts.map((prod: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 font-semibold text-slate-700">{prod.sku}</td>
                          <td className="px-4 py-3 font-semibold text-slate-900">{prod.name}</td>
                          <td className="px-4 py-3 text-slate-500">{prod.brand || '-'}</td>
                          <td className="px-4 py-3 text-right font-bold text-slate-900">
                            {prod.price !== undefined ? `${prod.price} Kč` : '-'}
                          </td>
                          <td className="px-4 py-3 text-slate-500 font-mono">{prod.ean || '-'}</td>
                          <td className="px-4 py-3 text-right">
                            <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-bold text-[10px]">
                              NOVÝ
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: UPDATES (DIFF VIEW) */}
          {activeTab === 'updates' && (
            <div className="border border-slate-105 rounded-xl overflow-hidden bg-slate-50/50 animate-in fade-in duration-150">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100/80 text-slate-600 uppercase tracking-wider font-bold border-b border-slate-200">
                      <th className="px-4 py-3 w-1/4">Produkt (SKU)</th>
                      <th className="px-4 py-3 w-3/4">Detekované změny (Aktuální stav ➔ Nová hodnota z importu)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {analysis.updatedProducts.length === 0 ? (
                      <tr>
                        <td colSpan={2} className="px-4 py-8 text-center text-slate-400 italic">
                          Nebyly nalezeny žádné změny u stávajících produktů.
                        </td>
                      </tr>
                    ) : (
                      analysis.updatedProducts.map((u: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-50/50 align-top">
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-800">{u.name}</div>
                            <div className="text-[10px] font-mono text-slate-500 mt-0.5">SKU: {u.sku}</div>
                          </td>
                          <td className="px-4 py-3 space-y-2">
                            {u.changes.map((c: any, i: number) => (
                              <div key={i} className="flex flex-wrap items-center gap-1.5 text-xs text-slate-700 bg-slate-50/30 p-1 px-2 rounded-lg border border-slate-100/50">
                                <span className="font-semibold text-slate-500 w-28 uppercase text-[9px] tracking-wider shrink-0">{c.field}:</span>
                                <span className="line-through text-slate-400 bg-slate-100/50 px-1.5 py-0.5 rounded text-[11px] truncate max-w-[200px]">{String(c.from !== null && c.from !== undefined ? c.from : '-')}</span>
                                <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span className="text-indigo-800 bg-indigo-50/70 border border-indigo-100/50 px-1.5 py-0.5 rounded font-semibold text-[11px] truncate max-w-[250px]">{String(c.to !== null && c.to !== undefined ? c.to : '-')}</span>
                              </div>
                            ))}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: WARNINGS */}
          {activeTab === 'warnings' && (
            <div className="space-y-3 animate-in fade-in duration-150">
              {analysis.warnings.length === 0 ? (
                <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl p-6 text-center text-xs font-semibold">
                  Výborně! Analýza neukázala žádná varování ani cenové nesrovnalosti. Data jsou v pořádku.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl bg-white overflow-hidden">
                  {analysis.warnings.map((w: any, idx: number) => {
                    const isPriceJump = w.type === 'price_jump';
                    return (
                      <div key={idx} className="p-4 flex gap-3.5 hover:bg-slate-50/30 transition-colors">
                        <div className={`p-2 rounded-xl shrink-0 h-9 w-9 flex items-center justify-center ${
                          isPriceJump ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-amber-50 text-amber-600 border border-amber-100'
                        }`}>
                          {isPriceJump ? <TrendingUp className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-slate-900 truncate max-w-sm">{w.name}</span>
                            <span className="font-mono text-[9px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-md">SKU: {w.sku}</span>
                          </div>
                          <p className={`text-xs mt-1 font-medium ${isPriceJump ? 'text-rose-700' : 'text-amber-800'}`}>
                            {w.message}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Overwrite Settings */}
          <div className="bg-slate-50/70 border border-slate-150 rounded-2xl p-5 space-y-4">
            <div>
              <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                <Settings className="w-4.5 h-4.5 text-indigo-600" />
                Nastavení přepisu stávajících produktů
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Zvolte, které údaje stávajících produktů (se stejným SKU) se mají přepsat daty z nahraného souboru:
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <label className="flex items-center gap-2.5 text-xs font-bold text-slate-700 cursor-pointer bg-white p-3 rounded-xl border border-slate-200/80 hover:border-indigo-300 hover:shadow-xs transition-all">
                <input
                  type="checkbox"
                  checked={overwriteConfig.name}
                  onChange={(e) => setOverwriteConfig({ ...overwriteConfig, name: e.target.checked })}
                  className="rounded text-indigo-600 focus:ring-indigo-500 h-4.5 w-4.5 border-slate-300 cursor-pointer"
                />
                <span>Název produktu</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs font-bold text-slate-700 cursor-pointer bg-white p-3 rounded-xl border border-slate-200/80 hover:border-indigo-300 hover:shadow-xs transition-all">
                <input
                  type="checkbox"
                  checked={overwriteConfig.brand}
                  onChange={(e) => setOverwriteConfig({ ...overwriteConfig, brand: e.target.checked })}
                  className="rounded text-indigo-600 focus:ring-indigo-500 h-4.5 w-4.5 border-slate-300 cursor-pointer"
                />
                <span>Značka</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs font-bold text-slate-700 cursor-pointer bg-white p-3 rounded-xl border border-slate-200/80 hover:border-indigo-300 hover:shadow-xs transition-all">
                <input
                  type="checkbox"
                  checked={overwriteConfig.price}
                  onChange={(e) => setOverwriteConfig({ ...overwriteConfig, price: e.target.checked })}
                  className="rounded text-indigo-600 focus:ring-indigo-500 h-4.5 w-4.5 border-slate-300 cursor-pointer"
                />
                <span>Prodejní cena</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs font-bold text-slate-700 cursor-pointer bg-white p-3 rounded-xl border border-slate-200/80 hover:border-indigo-300 hover:shadow-xs transition-all">
                <input
                  type="checkbox"
                  checked={overwriteConfig.safetyText}
                  onChange={(e) => setOverwriteConfig({ ...overwriteConfig, safetyText: e.target.checked })}
                  className="rounded text-indigo-600 focus:ring-indigo-500 h-4.5 w-4.5 border-slate-300 cursor-pointer"
                />
                <span>Bezpečnostní texty</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs font-bold text-slate-700 cursor-pointer bg-white p-3 rounded-xl border border-slate-200/80 hover:border-indigo-300 hover:shadow-xs transition-all">
                <input
                  type="checkbox"
                  checked={overwriteConfig.contactText}
                  onChange={(e) => setOverwriteConfig({ ...overwriteConfig, contactText: e.target.checked })}
                  className="rounded text-indigo-600 focus:ring-indigo-500 h-4.5 w-4.5 border-slate-300 cursor-pointer"
                />
                <span>Kontaktní údaje</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs font-bold text-slate-700 cursor-pointer bg-white p-3 rounded-xl border border-slate-200/80 hover:border-indigo-300 hover:shadow-xs transition-all">
                <input
                  type="checkbox"
                  checked={overwriteConfig.ean}
                  onChange={(e) => setOverwriteConfig({ ...overwriteConfig, ean: e.target.checked })}
                  className="rounded text-indigo-600 focus:ring-indigo-500 h-4.5 w-4.5 border-slate-300 cursor-pointer"
                />
                <span>EAN kódy</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs font-bold text-slate-700 cursor-pointer bg-white p-3 rounded-xl border border-slate-200/80 hover:border-indigo-300 hover:shadow-xs transition-all sm:col-span-2 md:col-span-1">
                <input
                  type="checkbox"
                  checked={overwriteConfig.note}
                  onChange={(e) => setOverwriteConfig({ ...overwriteConfig, note: e.target.checked })}
                  className="rounded text-indigo-600 focus:ring-indigo-500 h-4.5 w-4.5 border-slate-300 cursor-pointer"
                />
                <span>Poznámky</span>
              </label>
            </div>
          </div>

          {/* Info Banner */}
          <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-4 flex gap-3 text-indigo-800 text-xs font-semibold">
            <Database className="w-5 h-5 text-indigo-600 shrink-0" />
            <div>
              <p>Zápis do katalogu: <span className="text-indigo-950 font-bold">{rawRows.length} položek</span>.</p>
              <p className="text-[10px] text-indigo-600 mt-0.5">
                Stávající položky se stejným SKU budou aktualizovány podle vybraného nastavení přepisu výše, nové položky budou uloženy se všemi údaji ze souboru.
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="text-sm font-semibold text-slate-500 hover:text-slate-700 px-4 py-2 border border-slate-100 hover:border-slate-200 rounded-lg"
            >
              Zpět na mapování
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={resetImport}
                className="text-sm font-semibold text-rose-500 hover:text-rose-700 px-4 py-2 hover:bg-rose-50 rounded-lg"
              >
                Zahodit
              </button>
              <button
                onClick={handleFinalizeImport}
                disabled={loading}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-bold shadow-md shadow-indigo-600/10 transition-all duration-200 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Zapisování do DB...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Uložit do databáze
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
