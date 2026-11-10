'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { getProducts, getTemplates, savePrintJob, getPrintJobById, updateProduct } from '@/app/actions';
import { generateLabelsPdf, PrintItem } from '@/lib/pdfGenerator';
import { useSearchParams, useRouter } from 'next/navigation';
import { LabelPreview } from '@/components/LabelPreview';
import {
  Printer,
  Search,
  Plus,
  Minus,
  Trash2,
  RefreshCw,
  AlertCircle,
  Check,
  ChevronRight,
  Sparkles,
  ExternalLink,
  X,
  Pencil
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
}

interface LabelTemplate {
  id: string;
  name: string;
  fieldsConfig: string;
  fontConfig: string;
  layoutConfig: string;
  isDefault?: boolean;
}

function PrintPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [templates, setTemplates] = useState<LabelTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  
  const [printList, setPrintList] = useState<PrintItem[]>([]);
  const [startPosition, setStartPosition] = useState<number>(1);
  
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  // States for one-off font size adjustment & product preview selection
  const [customFontSizes, setCustomFontSizes] = useState({
    nameFontSize: 10,
    skuFontSize: 7,
    brandFontSize: 7,
    priceFontSize: 11,
    bodyFontSize: 6,
  });
  const [previewProductId, setPreviewProductId] = useState<string>('');

  // States for quick product editing inside print queue
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const handleQuickEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    setEditSaving(true);
    setEditError(null);

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

    if (res.success && res.product) {
      const updatedProduct = res.product as Product;
      
      // Update allProducts local list
      setAllProducts((prevProds) =>
        prevProds.map((p) => (p.id === updatedProduct.id ? updatedProduct : p))
      );

      // Update printList local list
      setPrintList((prevList) =>
        prevList.map((item) =>
          item.id === updatedProduct.id
            ? { ...item, ...updatedProduct }
            : item
        )
      );

      // Clear generated PDF since product data changed
      setPdfUrl(null);
      setSuccess(`Produkt "${updatedProduct.name}" byl úspěšně upraven.`);
      setEditingProduct(null);
    } else {
      setEditError(res.error || 'Chyba při ukládání změn.');
    }
    setEditSaving(false);
  };

  // Sync font sizes when templates are loaded or template changes
  useEffect(() => {
    const tpl = templates.find((t) => t.id === selectedTemplateId);
    if (!tpl) return;
    try {
      const parsedFonts = JSON.parse(tpl.fontConfig);
      setCustomFontSizes({
        nameFontSize: parsedFonts.nameFontSize ?? 10,
        skuFontSize: parsedFonts.skuFontSize ?? 7,
        brandFontSize: parsedFonts.brandFontSize ?? 7,
        priceFontSize: parsedFonts.priceFontSize ?? 11,
        bodyFontSize: parsedFonts.bodyFontSize ?? 6,
      });
    } catch (e) {
      // fallback
    }
  }, [selectedTemplateId, templates]);

  // Sync preview product ID based on print queue selection
  useEffect(() => {
    if (printList.length > 0) {
      if (!printList.some((item) => item.id === previewProductId)) {
        setPreviewProductId(printList[0].id);
      }
    } else {
      setPreviewProductId('');
    }
  }, [printList, previewProductId]);

  // Load products and templates
  const loadData = async () => {
    setLoading(true);
    try {
      const prods = await getProducts();
      setAllProducts(prods);
      
      const temps = await getTemplates();
      setTemplates(temps);
      if (temps.length > 0) {
        const defaultTemp = temps.find((t) => t.isDefault);
        setSelectedTemplateId(defaultTemp ? defaultTemp.id : temps[0].id);
      }
    } catch (err: any) {
      setError('Nepodařilo se načíst data pro tiskový modul.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Load print job if loadJob param is present in URL
  useEffect(() => {
    const jobId = searchParams.get('loadJob');
    if (!jobId || templates.length === 0 || allProducts.length === 0) return;

    const loadJobFromHistory = async () => {
      try {
        const job = await getPrintJobById(jobId);
        if (!job) {
          setError('Tisková úloha nebyla nalezena.');
          return;
        }

        const jobProducts = JSON.parse(job.products) as {
          productId: string;
          sku: string;
          name: string;
          price: number | null;
          quantity: number;
        }[];

        // Map to PrintItem with full product details
        const loadedList: PrintItem[] = [];
        for (const jp of jobProducts) {
          const prod = allProducts.find((p) => p.id === jp.productId || p.sku === jp.sku);
          if (prod) {
            loadedList.push({
              ...prod,
              quantity: jp.quantity,
            });
          } else {
            // fallback if product was deleted
            loadedList.push({
              id: jp.productId,
              sku: jp.sku,
              name: jp.name,
              brand: null,
              price: jp.price,
              safetyText: null,
              contactText: null,
              ean: null,
              note: null,
              quantity: jp.quantity,
            });
          }
        }

        if (loadedList.length > 0) {
          setPrintList(loadedList);
          setStartPosition(job.startPosition || 1);
          setSuccess('Tisková fronta byla naplněna z historie.');
          // Remove query param from URL without reloading
          const newUrl = window.location.pathname;
          window.history.replaceState({ path: newUrl }, '', newUrl);
        }
      } catch (e) {
        setError('Nepodařilo se načíst tiskovou úlohu z historie.');
      }
    };

    loadJobFromHistory();
  }, [searchParams, templates, allProducts]);

  // Filter products for search autocomplete
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = allProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.sku.toLowerCase().includes(query) ||
        (p.brand && p.brand.toLowerCase().includes(query)) ||
        (p.ean && p.ean.toLowerCase().includes(query))
    ).slice(0, 5); // Limit search result list to 5 items

    setSearchResults(filtered);
  }, [searchQuery, allProducts]);

  // Clamp start position if it exceeds labels per page of the new template
  useEffect(() => {
    const tpl = templates.find((t) => t.id === selectedTemplateId);
    if (!tpl) return;
    try {
      const lay = JSON.parse(tpl.layoutConfig);
      const maxLabels = (lay.columns || 3) * (lay.rows || 7);
      if (startPosition > maxLabels) {
        setStartPosition(1);
      }
    } catch (e) {
      // ignore
    }
  }, [selectedTemplateId, templates, startPosition]);

  // Výchozí počet = celý arch (dle zvolené šablony, fallback 21)
  const getLabelsPerPage = () => {
    const tpl = templates.find((t) => t.id === selectedTemplateId);
    if (!tpl) return 21;
    const lay = JSON.parse(tpl.layoutConfig);
    const c = Math.max(1, Math.floor((210 - (lay.leftMargin || 7.25) + (lay.horizontalGap || 2.5)) / ((lay.labelWidth || 63.5) + (lay.horizontalGap || 2.5))));
    const r = Math.max(1, Math.floor((297 - (lay.topMargin || 15.15) + (lay.verticalGap || 0)) / ((lay.labelHeight || 38.1) + (lay.verticalGap || 0))));
    return c * r;
  };

  // Sync printList dummy item for sixIconsLayout templates
  useEffect(() => {
    const tpl = templates.find((t) => t.id === selectedTemplateId);
    if (!tpl) return;
    try {
      const lay = JSON.parse(tpl.layoutConfig);
      const isSix = !!lay.sixIconsLayout;
      const hasDummy = printList.some((item) => item.id === 'dummy-icon-label');
      
      if (isSix) {
        if (!hasDummy) {
          const defaultQty = getLabelsPerPage();
          setPrintList([
            {
              id: 'dummy-icon-label',
              name: 'Štítek s ikonami',
              sku: 'IKONY',
              brand: null,
              price: null,
              safetyText: null,
              contactText: null,
              ean: null,
              note: null,
              quantity: defaultQty,
            },
          ]);
        }
      } else {
        if (hasDummy) {
          setPrintList([]);
        }
      }
    } catch (e) {
      // ignore
    }
  }, [selectedTemplateId, templates]);

  const handleAddToPrintList = (product: Product) => {
    setSearchQuery('');
    setSearchResults([]);
    setSuccess(null);
    setPdfUrl(null);

    const defaultQty = getLabelsPerPage();

    // Pokud produkt už je ve frontě, přidá celý arch navíc
    const existing = printList.find((item) => item.id === product.id);
    if (existing) {
      setPrintList(
        printList.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + defaultQty } : item
        )
      );
    } else {
      setPrintList([...printList, { ...product, quantity: defaultQty }]);
    }
  };

  const handleQuantityChange = (id: string, delta: number) => {
    setPdfUrl(null);
    setPrintList(
      printList
        .map((item) => {
          if (item.id === id) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as PrintItem[]
    );
  };

  const handleRemoveItem = (id: string) => {
    setPdfUrl(null);
    setPrintList(printList.filter((item) => item.id !== id));
  };

  // Helper to compile the flat sequence of labels for page layout mapping
  const getLabelSequence = () => {
    const sequence: { name: string; sku: string; brand: string }[] = [];
    for (const item of printList) {
      for (let i = 0; i < item.quantity; i++) {
        sequence.push({
          name: item.name,
          sku: item.sku,
          brand: item.brand || '',
        });
      }
    }
    return sequence;
  };

  const handleGeneratePdf = async () => {
    if (printList.length === 0) {
      setError('Tiskový seznam je prázdný. Přidejte prosím produkty.');
      return;
    }

    const template = templates.find((t) => t.id === selectedTemplateId);
    if (!template) {
      setError('Vyberte platnou šablonu vzhledu.');
      return;
    }

    setGenerating(true);
    setError(null);
    setSuccess(null);
    setPdfUrl(null);

    try {
      // Generate PDF client side
      const pdfBytes = await generateLabelsPdf(printList, template, startPosition, customFontSizes);
      
      // Create a blob URL to display / print
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);

      // Save print history in database
      const printJobProducts = printList.map((p) => ({
        productId: p.id,
        sku: p.sku,
        name: p.name,
        price: p.price ?? null,
        quantity: p.quantity,
      }));

      await savePrintJob(printJobProducts, startPosition);
      setSuccess('Tiskové PDF bylo úspěšně vygenerováno!');
    } catch (err: any) {
      setError(`Generování PDF selhalo: ${err.message || 'Neočekávaná chyba'}`);
    } finally {
      setGenerating(false);
    }
  };

  const totalLabels = printList.reduce((sum, item) => sum + item.quantity, 0);
  const labelSequence = getLabelSequence();
  const templateConfig = templates.find((t) => t.id === selectedTemplateId);
  const layout = templateConfig ? JSON.parse(templateConfig.layoutConfig) : null;

  // Auto-calculate columns and rows from A4 dimensions (210×297 mm)
  const cols = layout
    ? Math.max(1, Math.floor((210 - (layout.leftMargin || 7.25) + (layout.horizontalGap || 2.5)) / ((layout.labelWidth || 63.5) + (layout.horizontalGap || 2.5))))
    : 3;
  const rows = layout
    ? Math.max(1, Math.floor((297 - (layout.topMargin || 15.15) + (layout.verticalGap || 0)) / ((layout.labelHeight || 38.1) + (layout.verticalGap || 0))))
    : 7;
  const labelsPerPage = cols * rows;

  const totalSheetsNeeded = Math.ceil((totalLabels + (startPosition - 1)) / labelsPerPage) || 0;

  return (
    <div className="flex-1 p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 max-w-7xl mx-auto w-full">
      {/* Page Title & Controls - spans full width */}
      <div className="lg:col-span-12 mb-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
          Tisk štítků
        </h1>
        <p className="text-slate-500 mt-1">
          Přidejte produkty do tiskové fronty, zvolte startovní pozici na archu A4 a vygenerujte PDF k tisku.
        </p>
      </div>

      {/* Notifications */}
      <div className="lg:col-span-12">
        {success && (
          <div className="p-4 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl flex items-center gap-3 text-sm font-semibold animate-in fade-in duration-200">
            <Check className="w-5 h-5 text-emerald-600 shrink-0" />
            <div className="flex-1">{success}</div>
            {pdfUrl && (
              <a
                href={pdfUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Otevřít tiskový náhled
              </a>
            )}
          </div>
        )}

        {error && (
          <div className="p-4 bg-rose-50 border border-rose-100 text-rose-800 rounded-xl flex items-center gap-3 text-sm font-medium animate-in fade-in duration-200">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <p className="flex-1">{error}</p>
            <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* LEFT COLUMN: Queue & Selection (7 cols) */}
      <div className="lg:col-span-7 space-y-6">
        {/* Step 1: Select Template & Search Product */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
          <h3 className="font-bold text-sm text-slate-900 uppercase tracking-wider mb-2">
            1. Konfigurace tiskové dávky
          </h3>

          {/* Template dropdown */}
          <div>
            <label className="block text-xs font-bold text-slate-650 uppercase tracking-wider mb-1">
              Vybrat šablonu vzhledu etiket
            </label>
            <select
              value={selectedTemplateId}
              onChange={(e) => {
                setSelectedTemplateId(e.target.value);
                setPdfUrl(null);
              }}
              disabled={loading}
              className="w-full rounded-xl border border-slate-205 bg-white px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:outline-none disabled:opacity-50"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          {/* Search to add products */}
          {!layout?.sixIconsLayout && (
            <div className="relative">
              <label className="block text-xs font-bold text-slate-650 uppercase tracking-wider mb-1">
                Vyhledat produkt k přidání
              </label>
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Napište název, kód, značku nebo EAN..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  disabled={loading}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/20 text-sm focus:bg-white focus:border-indigo-500 focus:outline-none transition-all disabled:opacity-50"
                />
              </div>

              {/* Autocomplete Results dropdown */}
              {searchResults.length > 0 && (
                <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-150 rounded-xl shadow-xl z-20 divide-y divide-slate-100 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-100">
                  {searchResults.map((prod) => (
                    <button
                      key={prod.id}
                      onClick={() => handleAddToPrintList(prod)}
                      className="w-full text-left px-4 py-3 hover:bg-indigo-50/40 flex items-center justify-between text-xs transition-colors"
                    >
                      <div>
                        <span className="font-bold text-slate-800 text-sm block">{prod.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono mt-0.5">
                          SKU: {prod.sku} {prod.brand ? `• Značka: ${prod.brand}` : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 font-bold text-indigo-600 hover:text-indigo-800 shrink-0">
                        Přidat
                        <Plus className="w-3.5 h-3.5" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Živý náhled a jednorázová úprava písma */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
          <h3 className="font-bold text-sm text-slate-905 uppercase tracking-wider mb-2">
            Náhled štítku a úprava písma
          </h3>

          {printList.length === 0 ? (
            <div className="py-8 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
              <Printer className="w-8 h-8 text-slate-350 mx-auto mb-2" />
              <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
                Přidejte produkty do tiskové fronty pro zobrazení náhledu a případnou úpravu písma.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {printList.length > 1 && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Zvolit produkt pro náhled:
                  </label>
                  <select
                    value={previewProductId}
                    onChange={(e) => setPreviewProductId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none"
                  >
                    {printList.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} (SKU: {item.sku})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {(() => {
                const previewProduct = printList.find(p => p.id === previewProductId) || printList[0];
                if (!previewProduct || !templateConfig) return null;
                
                const fields = JSON.parse(templateConfig.fieldsConfig);
                const originalFonts = JSON.parse(templateConfig.fontConfig);
                const layout = JSON.parse(templateConfig.layoutConfig);
                
                const mergedFonts = { ...originalFonts, ...customFontSizes };

                return (
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                    {/* Preview (5 cols) */}
                    <div className="md:col-span-5 flex flex-col items-center justify-center bg-slate-50/40 rounded-xl p-4 border border-slate-100 min-h-[220px]">
                      <LabelPreview
                        fields={fields}
                        fonts={mergedFonts}
                        layout={layout}
                        product={{
                          name: previewProduct.name,
                          sku: previewProduct.sku,
                          brand: previewProduct.brand,
                          price: previewProduct.price,
                          safetyText: previewProduct.safetyText,
                          contactText: previewProduct.contactText,
                          ean: previewProduct.ean
                        }}
                      />
                    </div>

                    {/* Controls (7 cols) */}
                    <div className="md:col-span-7 space-y-3.5">
                      {layout?.sixIconsLayout ? (
                        <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 text-center">
                          <AlertCircle className="w-5 h-5 text-indigo-600 mx-auto mb-2" />
                          <p className="text-xs text-indigo-850 font-semibold leading-relaxed">
                            Tato šablona obsahuje pouze grafické ikony bez textových polí. Velikost písem nelze upravovat.
                          </p>
                        </div>
                      ) : (
                        <>
                          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Jednorázové přizpůsobení velikosti (pt)
                          </span>
                          
                          {/* Name Slider */}
                          <div className="space-y-1">
                            <div className="flex justify-between items-center text-xs font-semibold text-slate-650">
                              <span>Název produktu:</span>
                              <span className="font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">
                                {customFontSizes.nameFontSize} pt
                              </span>
                            </div>
                            <input
                              type="range"
                              min="4"
                              max="24"
                              step="0.5"
                              value={customFontSizes.nameFontSize}
                              onChange={(e) => setCustomFontSizes({ ...customFontSizes, nameFontSize: parseFloat(e.target.value) })}
                              className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-650"
                            />
                          </div>

                          {/* Brand Slider */}
                          {fields.showBrand && (
                            <div className="space-y-1">
                              <div className="flex justify-between items-center text-xs font-semibold text-slate-650">
                                <span>Značka:</span>
                                <span className="font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">
                                  {customFontSizes.brandFontSize} pt
                                </span>
                              </div>
                              <input
                                type="range"
                                min="3"
                                max="16"
                                step="0.5"
                                value={customFontSizes.brandFontSize}
                                onChange={(e) => setCustomFontSizes({ ...customFontSizes, brandFontSize: parseFloat(e.target.value) })}
                                className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-650"
                              />
                            </div>
                          )}

                          {/* SKU Slider */}
                          {(fields.showSku || fields.showEan) && (
                            <div className="space-y-1">
                              <div className="flex justify-between items-center text-xs font-semibold text-slate-650">
                                <span>SKU / EAN kód:</span>
                                <span className="font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">
                                  {customFontSizes.skuFontSize} pt
                                </span>
                              </div>
                              <input
                                type="range"
                                min="3"
                                max="16"
                                step="0.5"
                                value={customFontSizes.skuFontSize}
                                onChange={(e) => setCustomFontSizes({ ...customFontSizes, skuFontSize: parseFloat(e.target.value) })}
                                className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-650"
                              />
                            </div>
                          )}

                          {/* Price Slider */}
                          {fields.showPrice && (
                            <div className="space-y-1">
                              <div className="flex justify-between items-center text-xs font-semibold text-slate-650">
                                <span>Cena produktu:</span>
                                <span className="font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">
                                  {customFontSizes.priceFontSize} pt
                                </span>
                              </div>
                              <input
                                type="range"
                                min="4"
                                max="24"
                                step="0.5"
                                value={customFontSizes.priceFontSize}
                                onChange={(e) => setCustomFontSizes({ ...customFontSizes, priceFontSize: parseFloat(e.target.value) })}
                                className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-650"
                              />
                            </div>
                          )}

                          {/* Body/Contact Slider */}
                          {(fields.showSafetyText || fields.showContactText) && (
                            <div className="space-y-1">
                              <div className="flex justify-between items-center text-xs font-semibold text-slate-650">
                                <span>Bezpečnost a kontakt:</span>
                                <span className="font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">
                                  {customFontSizes.bodyFontSize} pt
                                </span>
                              </div>
                              <input
                                type="range"
                                min="3"
                                max="14"
                                step="0.5"
                                value={customFontSizes.bodyFontSize}
                                onChange={(e) => setCustomFontSizes({ ...customFontSizes, bodyFontSize: parseFloat(e.target.value) })}
                                className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-650"
                              />
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              if (originalFonts) {
                                setCustomFontSizes({
                                  nameFontSize: originalFonts.nameFontSize ?? 10,
                                  skuFontSize: originalFonts.skuFontSize ?? 7,
                                  brandFontSize: originalFonts.brandFontSize ?? 7,
                                  priceFontSize: originalFonts.priceFontSize ?? 11,
                                  bodyFontSize: originalFonts.bodyFontSize ?? 6,
                                });
                              }
                            }}
                            className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl py-2 transition-all mt-4"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Resetovat velikosti písma
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* Print Queue List */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <h3 className="font-bold text-sm text-slate-900 uppercase tracking-wider">
              {layout?.sixIconsLayout ? 'Nastavení počtu štítků' : `Tiskový seznam (${printList.length} položek)`}
            </h3>
            {printList.length > 0 && !layout?.sixIconsLayout && (
              <button
                onClick={() => setPrintList([])}
                className="text-xs font-semibold text-rose-500 hover:text-rose-700 hover:underline"
              >
                Vyprázdnit
              </button>
            )}
          </div>

          {printList.length === 0 ? (
            <div className="py-16 text-center">
              <Printer className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500 max-w-xs mx-auto leading-relaxed">
                Tisková fronta je prázdná. Vyhledejte a přidejte produkty k tisku pomocí vyhledávače výše.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[360px] overflow-y-auto pr-1">
              {printList.map((item) => (
                <div key={item.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <span className="font-semibold text-slate-900 text-sm truncate block">
                      {layout?.sixIconsLayout ? 'Štítek s ikonami (2×3)' : item.name}
                    </span>
                    <div className="flex flex-wrap items-center gap-2 mt-0.5">
                      <span className="font-mono text-[10px] text-slate-400">
                        {layout?.sixIconsLayout ? `Šablona: ${templateConfig?.name}` : `SKU: ${item.sku} ${item.price ? `| ${item.price} Kč` : ''}`}
                      </span>
                      {!layout?.sixIconsLayout && (
                        <>
                          {(!item.price || item.price <= 0) && (
                            <span className="text-[9px] font-bold bg-rose-50 border border-rose-100 text-rose-700 px-1.5 py-0.5 rounded whitespace-nowrap" title="Chybí cena">Chybí cena</span>
                          )}
                          {!item.ean && (
                            <span className="text-[9px] font-bold bg-rose-50 border border-rose-100 text-rose-700 px-1.5 py-0.5 rounded whitespace-nowrap" title="Chybí EAN">Chybí EAN</span>
                          )}
                          {!item.safetyText && (
                            <span className="text-[9px] font-bold bg-amber-50 border border-amber-100 text-amber-800 px-1.5 py-0.5 rounded whitespace-nowrap" title="Chybí bezpečnostní text">Chybí bezp.</span>
                          )}
                          {!item.contactText && (
                            <span className="text-[9px] font-bold bg-amber-50 border border-amber-100 text-amber-800 px-1.5 py-0.5 rounded whitespace-nowrap" title="Chybí kontaktní údaje">Chybí kontakt</span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  
                  {/* Quantity Controls & Presets */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 shrink-0">
                    {/* Preset Buttons */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setPdfUrl(null);
                          setPrintList(
                            printList.map((p) => (p.id === item.id ? { ...p, quantity: 1 } : p))
                          );
                        }}
                        className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-[10px] font-bold text-slate-600 rounded-md transition-colors"
                        title="Nastavit přesně 1 štítek"
                      >
                        1 ks
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPdfUrl(null);
                          setPrintList(
                            printList.map((p) => (p.id === item.id ? { ...p, quantity: labelsPerPage } : p))
                          );
                        }}
                        className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-[10px] font-bold text-indigo-650 rounded-md transition-colors"
                        title={`Nastavit přesně 1 arch (${labelsPerPage} ks)`}
                      >
                        1 arch
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPdfUrl(null);
                          setPrintList(
                            printList.map((p) => (p.id === item.id ? { ...p, quantity: Math.max(1, p.quantity - labelsPerPage) } : p))
                          );
                        }}
                        className="px-2 py-1 bg-slate-150/65 hover:bg-slate-200 text-[10px] font-bold text-slate-600 rounded-md transition-colors disabled:opacity-40"
                        disabled={item.quantity <= labelsPerPage}
                        title={`Odebrat 1 arch (${labelsPerPage} ks)`}
                      >
                        -Arch
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPdfUrl(null);
                          setPrintList(
                            printList.map((p) => (p.id === item.id ? { ...p, quantity: p.quantity + labelsPerPage } : p))
                          );
                        }}
                        className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-[10px] font-bold text-indigo-650 rounded-md transition-colors"
                        title={`Přidat 1 arch (${labelsPerPage} ks)`}
                      >
                        +Arch
                      </button>
                    </div>

                    {/* Standard +/- and manual input */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleQuantityChange(item.id, -1)}
                        className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 hover:border-slate-350 transition-all"
                      >
                        <Minus className="w-3.5 h-3.5 text-slate-650" />
                      </button>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 1;
                          setPdfUrl(null);
                          setPrintList(
                            printList.map((p) => (p.id === item.id ? { ...p, quantity: Math.max(1, val) } : p))
                          );
                        }}
                        className="w-12 text-center font-bold text-slate-800 text-sm border border-slate-150 rounded-lg py-0.5 focus:outline-none focus:border-indigo-400"
                      />
                      <button
                        type="button"
                        onClick={() => handleQuantityChange(item.id, 1)}
                        className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 hover:border-slate-350 transition-all"
                      >
                        <Plus className="w-3.5 h-3.5 text-slate-650" />
                      </button>
                      {!layout?.sixIconsLayout && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setEditError(null);
                              setEditingProduct({
                                id: item.id,
                                sku: item.sku,
                                name: item.name,
                                brand: item.brand ?? null,
                                price: item.price ?? null,
                                safetyText: item.safetyText ?? null,
                                contactText: item.contactText ?? null,
                                ean: item.ean ?? null,
                                note: item.note ?? null,
                              });
                            }}
                            className="p-1.5 hover:bg-slate-105 text-slate-400 hover:text-indigo-600 rounded-lg transition-colors ml-1"
                            title="Rychlá úprava produktu"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.id)}
                            className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors ml-1"
                            title="Odebrat z tisku"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: Visual position selector & sheet preview (5 cols) */}
      <div className="lg:col-span-5 space-y-6">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-6">
          <div>
            <h3 className="font-bold text-sm text-slate-900 uppercase tracking-wider mb-1">
              2. Startovní pozice a náhled archu
            </h3>
            <p className="text-[11px] text-slate-500">
              Chcete-li využít načatý arch papíru, klikněte v mřížce na pozici, od které má tisk začít.
            </p>
          </div>

          {/* Interactive Start Position Grid */}
          <div className="max-w-[240px] mx-auto">
            <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider text-center mb-3">
              A4 arch ({cols} sloupců × {rows} řad)
            </span>
            
            <div 
              style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
              className="grid gap-2 border border-slate-100 bg-slate-50/50 p-3 rounded-2xl"
            >
              {Array.from({ length: labelsPerPage }).map((_, idx) => {
                const positionNum = idx + 1;
                const isSkipped = positionNum < startPosition;
                
                // Determine what product covers this slot on Page 1 (if any)
                let slotLabel = '';
                let bgClass = 'bg-white hover:bg-indigo-50 border-slate-200 text-slate-700';
                
                if (isSkipped) {
                  slotLabel = 'PRÁZDNÉ';
                  bgClass = 'bg-slate-100 border-dashed border-slate-250 text-slate-350 select-none';
                } else {
                  const sequenceIndex = positionNum - startPosition;
                  if (sequenceIndex < labelSequence.length) {
                    const item = labelSequence[sequenceIndex];
                    slotLabel = item.sku;
                    bgClass = 'bg-indigo-50/80 border-indigo-200 text-indigo-750 font-bold shadow-sm';
                  } else {
                    slotLabel = '';
                  }
                }

                // If starting position matches
                const isStart = positionNum === startPosition;

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setStartPosition(positionNum);
                      setPdfUrl(null);
                    }}
                    className={`h-11 rounded-lg border text-[10px] flex flex-col items-center justify-center relative transition-all duration-150 ${bgClass} ${
                      isStart ? 'ring-2 ring-indigo-600 ring-offset-1 border-indigo-600' : ''
                    }`}
                  >
                    <span className="absolute top-0.5 left-1 text-[8px] font-bold opacity-45">{positionNum}</span>
                    <span className="truncate max-w-full px-0.5 tracking-tighter scale-90 mt-1">
                      {isSkipped ? 'vynechat' : slotLabel || 'prázdný'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick specs for printing */}
          <div className="bg-slate-50 rounded-2xl p-4 text-xs font-semibold text-slate-600 space-y-2.5">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <span>Naplánovaný počet štítků:</span>
              <span className="font-bold text-slate-900">{totalLabels} ks</span>
            </div>
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <span>Start tisku na pozici:</span>
              <span className="font-bold text-slate-900">{startPosition}</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Spotřeba A4 papíru:</span>
              <span className="font-bold text-indigo-600">
                {totalSheetsNeeded} {totalSheetsNeeded === 1 ? 'arch' : totalSheetsNeeded < 5 ? 'archy' : 'archů'}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2">
            <button
              onClick={handleGeneratePdf}
              disabled={printList.length === 0 || generating}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-bold shadow-md shadow-indigo-600/10 transition-all duration-205 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {generating ? (
                <>
                  <RefreshCw className="w-4.5 h-4.5 animate-spin" />
                  Generování souboru...
                </>
              ) : (
                <>
                  <Printer className="w-4.5 h-4.5" />
                  Vygenerovat tiskové PDF
                </>
              )}
            </button>

            {pdfUrl && (
              <a
                href={pdfUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full flex items-center justify-center gap-2 border border-emerald-500 hover:bg-emerald-50 text-emerald-700 py-3 rounded-xl font-semibold transition-all text-sm"
              >
                <Sparkles className="w-4.5 h-4.5 text-emerald-600" />
                Otevřít PDF v tiskovém náhledu
              </a>
            )}
          </div>
        </div>
      </div>

      {/* 3. LIVE PDF PREVIEW */}
      {pdfUrl && (
        <div className="lg:col-span-12 bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4 animate-in fade-in duration-300">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <Printer className="w-5 h-5 text-emerald-600" />
                Živý tiskový náhled PDF
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Zkontrolujte vzhled štítků na A4 archu. Můžete tisknout přímo z tohoto okna nebo soubor stáhnout.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={pdfUrl}
                download="stitky_k_tisku.pdf"
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-sm"
              >
                Stáhnout soubor PDF
              </a>
              <button
                onClick={() => setPdfUrl(null)}
                className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-50 rounded-lg transition-colors"
                title="Skrýt náhled"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3 flex items-start gap-2.5 text-xs text-amber-900">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-bold">Důležité pro přesný tisk na etikety:</span>
              <p className="text-amber-800">
                V dialogu tisku (Ctrl+P) nastavte <strong>Měřítko: 100 % (Skutečná velikost)</strong> a <strong>Okraje: Žádné</strong>. PDF soubor má toto nastavení zakódováno přímo v sobě, ale některé prohlížeče vyžadují toto potvrzení při prvním tisku.
              </p>
            </div>
          </div>

          <iframe
            src={pdfUrl}
            className="w-full h-[650px] border border-slate-150 rounded-2xl shadow-inner bg-slate-50"
            title="Tiskový náhled PDF"
          />
        </div>
      )}

      {/* Quick Edit Modal */}
      {editingProduct && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl p-6 border border-slate-100 animate-in zoom-in-95 duration-200 text-slate-800 text-left flex flex-col max-h-[85vh]">
            {/* Header - Pinned */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4 shrink-0">
              <div className="flex items-center gap-2">
                <Pencil className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-lg text-slate-900">Rychlá úprava produktu</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="text-slate-400 hover:text-slate-700 hover:bg-slate-50 p-1.5 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {editError && (
              <div className="mb-4 p-3.5 bg-rose-50 border border-rose-100 text-rose-800 rounded-xl text-xs font-semibold flex items-center gap-2 shrink-0">
                <AlertCircle className="w-4.5 h-4.5 text-rose-605 shrink-0" />
                <p className="flex-1">{editError}</p>
              </div>
            )}

            {/* Form - Layout split into Scrollable container and Pinned footer */}
            <form onSubmit={handleQuickEditSubmit} className="flex flex-col flex-1 overflow-hidden">
              {/* Scrollable Fields area */}
              <div className="space-y-4 overflow-y-auto pr-1.5 flex-1 pb-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Název produktu <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editingProduct.name}
                    onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Kód (SKU) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={editingProduct.sku}
                      onChange={(e) => setEditingProduct({ ...editingProduct, sku: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                      EAN kód
                    </label>
                    <input
                      type="text"
                      value={editingProduct.ean || ''}
                      onChange={(e) => setEditingProduct({ ...editingProduct, ean: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Značka
                    </label>
                    <input
                      type="text"
                      value={editingProduct.brand || ''}
                      onChange={(e) => setEditingProduct({ ...editingProduct, brand: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Cena (Kč)
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={editingProduct.price !== null && editingProduct.price !== undefined ? editingProduct.price : ''}
                      onChange={(e) => {
                        const val = e.target.value === '' ? null : parseFloat(e.target.value);
                        setEditingProduct({ ...editingProduct, price: val });
                      }}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Bezpečnostní text
                  </label>
                  <textarea
                    rows={2}
                    value={editingProduct.safetyText || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, safetyText: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Kontaktní text
                  </label>
                  <textarea
                    rows={2}
                    value={editingProduct.contactText || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, contactText: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Poznámka (interní)
                  </label>
                  <input
                    type="text"
                    value={editingProduct.note || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, note: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                  />
                </div>
              </div>

              {/* Pinned Footer */}
              <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100 mt-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 transition-all cursor-pointer"
                >
                  Storno
                </button>
                <button
                  type="submit"
                  disabled={editSaving}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all duration-200 shadow-md shadow-indigo-600/10 hover:shadow-lg hover:shadow-indigo-600/15 cursor-pointer flex items-center gap-2"
                >
                  {editSaving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Ukládání...
                    </>
                  ) : (
                    'Uložit změny'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PrintPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 p-8 text-center flex flex-col items-center justify-center py-24">
          <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mb-3" />
          <p className="text-sm font-medium text-slate-500">Načítání tiskového modulu...</p>
        </div>
      }
    >
      <PrintPageContent />
    </Suspense>
  );
}
