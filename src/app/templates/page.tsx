'use client';

import React, { useState, useEffect } from 'react';
import { getTemplates, saveTemplate, deleteTemplate, duplicateTemplate, updateTemplateOrder, setDefaultTemplate, getContactRules } from '@/app/actions';
import {
  Palette,
  Plus,
  Edit2,
  Trash2,
  Check,
  AlertCircle,
  X,
  RefreshCw,
  Sliders,
  Type,
  LayoutGrid,
  Copy,
  GripVertical,
  Star,
  Download,
  Upload
} from 'lucide-react';
import { LabelPreview } from '@/components/LabelPreview';

interface LabelTemplate {
  id: string;
  name: string;
  fieldsConfig: string;
  fontConfig: string;
  layoutConfig: string;
  sortOrder?: number;
  isDefault?: boolean;
}


export default function TemplatesPage() {
  const [templates, setTemplates] = useState<LabelTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Edit states
  const [editingTemplate, setEditingTemplate] = useState<LabelTemplate | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const [draggedId, setDraggedId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === id) return;

    const draggedIndex = templates.findIndex((t) => t.id === draggedId);
    const targetIndex = templates.findIndex((t) => t.id === id);

    if (draggedIndex !== -1 && targetIndex !== -1) {
      const updated = [...templates];
      const [draggedItem] = updated.splice(draggedIndex, 1);
      updated.splice(targetIndex, 0, draggedItem);
      setTemplates(updated);
    }
  };

  const handleDragEnd = async () => {
    setDraggedId(null);
    const orderedIds = templates.map((t) => t.id);
    try {
      const res = await updateTemplateOrder(orderedIds);
      if (!res.success) {
        setError(res.error || 'Nepodařilo se uložit pořadí šablon.');
      }
    } catch (err) {
      setError('Chyba při ukládání pořadí šablon.');
    }
  };

  const handleSetDefault = async (id: string) => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await setDefaultTemplate(id);
      if (res.success) {
        setSuccess('Šablona byla nastavena jako výchozí.');
        loadTemplates();
      } else {
        setError(res.error || 'Nepodařilo se nastavit výchozí šablonu.');
        setLoading(false);
      }
    } catch (err) {
      setError('Chyba při nastavování výchozí šablony.');
      setLoading(false);
    }
  };

  // Form states
  const [templateName, setTemplateName] = useState('');
  const [previewProduct, setPreviewProduct] = useState<any>({
    name: 'Čisticí utěrky z mikrovlákna Premium',
    sku: 'SPK-UT-001',
    brand: 'Spoko Clean',
    price: 189,
    safetyText: 'Uchovávejte mimo dosah dětí. Pouze pro vnější použití.',
    contactText: 'Evolution Beauty Institut s. r. o.\nIČO: 07996811\n5. května 70, 140 00 Praha 4\nwww.depilujeme.cz',
    ean: '8594001230012',
  });

  useEffect(() => {
    const fetchDefaultContact = async () => {
      try {
        const rules = await getContactRules();
        const defaultRule = rules.find((r: any) => r.isDefault);
        if (defaultRule) {
          const parts = [];
          if (defaultRule.companyName) parts.push(defaultRule.companyName.trim());
          if (defaultRule.ico) {
            const trimmedIco = defaultRule.ico.trim();
            const icoStr = trimmedIco.toLowerCase().startsWith('ičo:') ? trimmedIco : `IČO: ${trimmedIco}`;
            parts.push(icoStr);
          }
          if (defaultRule.address) parts.push(defaultRule.address.trim());
          if (defaultRule.website) parts.push(defaultRule.website.trim());
          
          const defaultContactText = parts.join('\n');
          const defaultSafetyText = defaultRule.safetyText || 'Uchovávejte mimo dosah dětí. Pouze pro vnější použití.';
          
          setPreviewProduct((prev: any) => ({
            ...prev,
            contactText: defaultContactText,
            safetyText: defaultSafetyText,
          }));
        }
      } catch (err) {
        console.error('Error loading default contact rule for preview:', err);
      }
    };
    
    fetchDefaultContact();
  }, []);

  const [fields, setFields] = useState({
    showName: true,
    showSku: false,
    showBrand: false,
    showPrice: true,
    showSafetyText: true,
    showContactText: true,
    showEan: false,
    showNote: false,
    showSafetyIcon: false,
    showContactIcon: false,
  });

  const [fonts, setFonts] = useState({
    fontFamily: 'Helvetica',
    nameFontSize: 10,
    skuFontSize: 7,
    brandFontSize: 7,
    priceFontSize: 11,
    bodyFontSize: 6,
    nameFontBold: true,
    priceFontBold: true,
    textAlignment: 'left',
    brandColor: '#64748b',
    nameColor: '#0f172a',
    priceColor: '#dc2626',
    bodyColor: '#334155',
  });

  const [layout, setLayout] = useState({
    labelWidth: 63.5,
    labelHeight: 38.1,
    topMargin: 15.15,
    leftMargin: 7.25,
    horizontalGap: 2.5,
    verticalGap: 0,
    columns: 3,
    rows: 7,
    dualLayout: false,
    labelRotation: 0,
    customIcons: [] as any[],
    sixIconsLayout: false,
  });

  // Auto-calculate columns and rows from A4 dimensions (210×297 mm)
  useEffect(() => {
    const A4_WIDTH = 210;
    const A4_HEIGHT = 297;
    const calcCols = Math.max(1, Math.floor((A4_WIDTH - layout.leftMargin + layout.horizontalGap) / (layout.labelWidth + layout.horizontalGap)));
    const calcRows = Math.max(1, Math.floor((A4_HEIGHT - layout.topMargin + layout.verticalGap) / (layout.labelHeight + layout.verticalGap)));
    if (calcCols !== layout.columns || calcRows !== layout.rows) {
      setLayout((prev) => ({ ...prev, columns: calcCols, rows: calcRows }));
    }
  }, [layout.labelWidth, layout.labelHeight, layout.topMargin, layout.leftMargin, layout.horizontalGap, layout.verticalGap]);

  // Load templates
  const loadTemplates = async () => {
    setLoading(true);
    try {
      const res = await getTemplates();
      setTemplates(res);
    } catch (err: any) {
      setError('Nepodařilo se načíst šablony.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const handleEditClick = (temp: LabelTemplate) => {
    setEditingTemplate(temp);
    setIsNew(false);
    setTemplateName(temp.name);
    
    const parsedFields = JSON.parse(temp.fieldsConfig);
    const parsedFonts = JSON.parse(temp.fontConfig);

    setFields({
      showName: true,
      showSku: true,
      showBrand: true,
      showPrice: true,
      showSafetyText: true,
      showContactText: true,
      showEan: true,
      showNote: false,
      showSafetyIcon: false,
      showContactIcon: false,
      ...parsedFields,
    });

    setFonts({
      fontFamily: 'Helvetica',
      nameFontSize: 10,
      skuFontSize: 7,
      brandFontSize: 7,
      priceFontSize: 11,
      bodyFontSize: 6,
      nameFontBold: true,
      priceFontBold: true,
      textAlignment: 'left',
      brandColor: '#64748b',
      nameColor: '#0f172a',
      priceColor: '#dc2626',
      bodyColor: '#334155',
      ...parsedFonts,
    });

    const parsedLayout = JSON.parse(temp.layoutConfig);
    setLayout({
      labelWidth: 63.5,
      labelHeight: 38.1,
      topMargin: 15.15,
      leftMargin: 7.25,
      horizontalGap: 2.5,
      verticalGap: 0,
      columns: 3,
      rows: 7,
      dualLayout: false,
      labelRotation: 0,
      sixIconsLayout: false,
      ...parsedLayout,
    });
    setTimeout(() => {
      const mainEl = document.querySelector('main');
      mainEl?.scrollTo({ top: 0, behavior: 'smooth' });
    }, 100);
  };

  const handleCreateNewClick = () => {
    setEditingTemplate({
      id: '',
      name: '',
      fieldsConfig: '',
      fontConfig: '',
      layoutConfig: '',
    });
    setIsNew(true);
    setTemplateName('Nová šablona štítku');
    
    // Reset to defaults (Spoko S060630380 dimensions)
    setFields({
      showName: true,
      showSku: false,
      showBrand: false,
      showPrice: true,
      showSafetyText: true,
      showContactText: true,
      showEan: false,
      showNote: false,
      showSafetyIcon: false,
      showContactIcon: false,
    });
    setFonts({
      fontFamily: 'Helvetica',
      nameFontSize: 10,
      skuFontSize: 7,
      brandFontSize: 7,
      priceFontSize: 11,
      bodyFontSize: 6,
      nameFontBold: true,
      priceFontBold: true,
      textAlignment: 'left',
      brandColor: '#64748b',
      nameColor: '#0f172a',
      priceColor: '#dc2626',
      bodyColor: '#334155',
    });
    setLayout({
      labelWidth: 63.5,
      labelHeight: 38.1,
      topMargin: 15.15,
      leftMargin: 7.25,
      horizontalGap: 2.5,
      verticalGap: 0,
      columns: 3,
      rows: 7,
      dualLayout: false,
      labelRotation: 0,
      customIcons: [],
      sixIconsLayout: false,
    });
    setTimeout(() => {
      const mainEl = document.querySelector('main');
      mainEl?.scrollTo({ top: 0, behavior: 'smooth' });
    }, 100);
  };

  const handleIconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (!base64) return;

      const newIcon = {
        id: Math.random().toString(36).substring(2, 9),
        name: file.name.substring(0, file.name.lastIndexOf('.')) || file.name,
        position: 'bottom-right' as const,
        imageData: base64,
        iconWidth: 10,
        iconHeight: 10,
      };

      setLayout((prev) => ({
        ...prev,
        customIcons: [...(prev.customIcons || []), newIcon],
      }));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRemoveIcon = (id: string) => {
    setLayout((prev) => ({
      ...prev,
      customIcons: (prev.customIcons || []).filter((icon: any) => icon.id !== id),
    }));
  };

  const handleUpdateIcon = (id: string, key: string, value: any) => {
    setLayout((prev) => ({
      ...prev,
      customIcons: (prev.customIcons || []).map((icon: any) => {
        if (icon.id === id) {
          return { ...icon, [key]: value };
        }
        return icon;
      }),
    }));
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateName.trim()) {
      setError('Název šablony je povinný.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    const res = await saveTemplate(
      isNew ? null : editingTemplate?.id || null,
      templateName,
      fields,
      fonts,
      layout
    );

    if (res.success) {
      setSuccess(`Šablona "${templateName}" byla úspěšně uložena.`);
      setEditingTemplate(null);
      loadTemplates();
    } else {
      setError(res.error || 'Nepodařilo se uložit šablonu.');
      setLoading(false);
    }
  };

  const handleDeleteExecute = async (id: string) => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    const res = await deleteTemplate(id);
    if (res.success) {
      setSuccess('Šablona byla smazána.');
      setShowDeleteConfirm(null);
      loadTemplates();
    } else {
      setError(res.error || 'Nepodařilo se smazat šablonu.');
      setLoading(false);
    }
  };

  const handleDuplicateClick = async (id: string) => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await duplicateTemplate(id);
      if (res.success) {
        setSuccess('Šablona byla úspěšně duplikována.');
        loadTemplates();
      } else {
        setError(res.error || 'Nepodařilo se duplikovat šablonu.');
        setLoading(false);
      }
    } catch (err: any) {
      setError('Nepodařilo se duplikovat šablonu.');
      setLoading(false);
    }
  };

  const handleExportTemplate = () => {
    if (!editingTemplate) return;
    const config = {
      name: templateName,
      fieldsConfig: JSON.stringify(fields),
      fontConfig: JSON.stringify(fonts),
      layoutConfig: JSON.stringify(layout),
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${templateName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_sablona.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportTemplate = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const config = JSON.parse(text);
        
        if (config.name) setTemplateName(config.name);
        if (config.fieldsConfig) setFields(JSON.parse(config.fieldsConfig));
        if (config.fontConfig) setFonts(JSON.parse(config.fontConfig));
        if (config.layoutConfig) setLayout(JSON.parse(config.layoutConfig));
        
        setSuccess('Konfigurace šablony byla úspěšně naimportována do editoru. Zkontrolujte náhled a uložte změny.');
      } catch (err) {
        setError('Neplatný formát souboru šablony.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
            Šablony štítků
          </h1>
          <p className="text-slate-500 mt-1">
            Upravujte rozložení polí, velikost písem a kalibrujte tiskové okraje pro konkrétní tiskárny.
          </p>
        </div>
        {!editingTemplate && (
          <button
            onClick={handleCreateNewClick}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-semibold shadow-md shadow-indigo-600/10 transition-all duration-200"
          >
            <Plus className="w-4 h-4" />
            Nová šablona
          </button>
        )}
      </div>

      {/* Notifications */}
      {success && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl flex items-start gap-3 text-sm font-medium">
          <Check className="w-5 h-5 shrink-0 text-emerald-600" />
          <p className="flex-1">{success}</p>
          <button onClick={() => setSuccess(null)} className="text-emerald-400 hover:text-emerald-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-100 text-rose-800 rounded-xl flex items-start gap-3 text-sm font-medium">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
          <p className="flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {editingTemplate && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-8">
          <form onSubmit={handleFormSubmit} className="lg:col-span-8 bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-6 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="pb-4 border-b border-slate-100 space-y-3">
              <div className="flex items-center justify-between gap-4">
                <h3 className="font-bold text-lg text-indigo-900 flex items-center gap-2">
                  <Palette className="w-5 h-5 text-indigo-500" />
                  {isNew ? 'Vytvořit novou šablonu vzhledu' : `Upravit šablonu: ${templateName}`}
                </h3>
                <button
                  type="button"
                  onClick={() => setEditingTemplate(null)}
                  className="text-xs font-bold text-slate-400 hover:text-slate-600 px-3 py-1.5 hover:bg-slate-50 border border-slate-100 rounded-lg transition-all"
                >
                  Zpět na přehled
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-indigo-600 px-3 py-1.5 bg-white border border-slate-200 hover:border-indigo-200 rounded-xl transition-all cursor-pointer select-none">
                  <Upload className="w-3.5 h-3.5 text-slate-400" />
                  <span>Importovat JSON</span>
                  <input
                    type="file"
                    accept=".json,application/json"
                    className="hidden"
                    onChange={handleImportTemplate}
                  />
                </label>
                {!isNew && (
                  <button
                    type="button"
                    onClick={handleExportTemplate}
                    className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-indigo-600 px-3 py-1.5 bg-white border border-slate-200 hover:border-indigo-200 rounded-xl transition-all cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-400" />
                    Exportovat JSON
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Template Basic name */}
            <div className="md:col-span-3">
              <label className="block text-sm font-semibold text-slate-700 mb-1">Název šablony</label>
              <input
                type="text"
                required
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Např: Horní tiskárna HP (Spoko 3x7)"
                className="w-full max-w-md rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>

            {/* Col 1: Field Visibility */}
            <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 space-y-4">
              <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2 pb-2 border-b border-slate-100">
                <Sliders className="w-4 h-4 text-indigo-500" />
                Zobrazovaná pole
              </h4>
              <div className="space-y-2.5 text-sm font-medium text-slate-650">
                {Object.keys(fields).filter((k) => !k.endsWith('Icon')).map((key) => {
                  const k = key as keyof typeof fields;
                  return (
                    <label key={k} className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={fields[k]}
                        onChange={(e) => setFields({ ...fields, [k]: e.target.checked })}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4.5 h-4.5 mt-0.5 shrink-0"
                      />
                      <span>
                        {k === 'showName' && 'Název produktu'}
                        {k === 'showSku' && 'SKU (Kód)'}
                        {k === 'showBrand' && 'Značka'}
                        {k === 'showPrice' && 'Cena'}
                        {k === 'showSafetyText' && 'Bezpečnostní informace'}
                        {k === 'showContactText' && 'Kontaktní údaje'}
                        {k === 'showEan' && 'EAN kód'}
                        {k === 'showNote' && 'Poznámka'}
                      </span>
                    </label>
                  );
                })}

                <div className="pt-3 border-t border-slate-150 space-y-2.5">
                  <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Dekorativní ikony</span>
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={fields.showSafetyIcon}
                      onChange={(e) => setFields({ ...fields, showSafetyIcon: e.target.checked })}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4.5 h-4.5 mt-0.5 shrink-0"
                    />
                    <span className="text-xs">Výstražný trojúhelník u bezpečnosti</span>
                  </label>
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={fields.showContactIcon}
                      onChange={(e) => setFields({ ...fields, showContactIcon: e.target.checked })}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4.5 h-4.5 mt-0.5 shrink-0"
                    />
                    <span className="text-xs">Obálka u kontaktu</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Col 2: Fonts Config */}
            <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 space-y-4">
              <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2 pb-2 border-b border-slate-100">
                <Type className="w-4 h-4 text-indigo-500" />
                Velikosti písem (body)
              </h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-600 font-semibold">Název produktu:</span>
                  <input
                    type="number"
                    step="0.5"
                    value={fonts.nameFontSize}
                    onChange={(e) => setFonts({ ...fonts, nameFontSize: parseFloat(e.target.value) || 8 })}
                    className="w-16 text-center rounded-lg border border-slate-200 px-2 py-1 text-xs"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-600 font-semibold">SKU / Kód:</span>
                  <input
                    type="number"
                    step="0.5"
                    value={fonts.skuFontSize}
                    onChange={(e) => setFonts({ ...fonts, skuFontSize: parseFloat(e.target.value) || 6 })}
                    className="w-16 text-center rounded-lg border border-slate-200 px-2 py-1 text-xs"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-600 font-semibold">Značka:</span>
                  <input
                    type="number"
                    step="0.5"
                    value={fonts.brandFontSize}
                    onChange={(e) => setFonts({ ...fonts, brandFontSize: parseFloat(e.target.value) || 6 })}
                    className="w-16 text-center rounded-lg border border-slate-200 px-2 py-1 text-xs"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-600 font-semibold">Cena produktu:</span>
                  <input
                    type="number"
                    step="0.5"
                    value={fonts.priceFontSize}
                    onChange={(e) => setFonts({ ...fonts, priceFontSize: parseFloat(e.target.value) || 9 })}
                    className="w-16 text-center rounded-lg border border-slate-200 px-2 py-1 text-xs"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-600 font-semibold">Bezpečnost a kontakt:</span>
                  <input
                    type="number"
                    step="0.5"
                    value={fonts.bodyFontSize}
                    onChange={(e) => setFonts({ ...fonts, bodyFontSize: parseFloat(e.target.value) || 5 })}
                    className="w-16 text-center rounded-lg border border-slate-200 px-2 py-1 text-xs"
                  />
                </div>

                <div className="pt-3 border-t border-slate-150">
                  <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wider">Zarovnání textu</label>
                  <select
                    value={fonts.textAlignment || 'left'}
                    onChange={(e) => setFonts({ ...fonts, textAlignment: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs bg-white focus:outline-none"
                  >
                    <option value="left">Zarovnat vlevo</option>
                    <option value="center">Zarovnat na střed</option>
                    <option value="right">Zarovnat vpravo</option>
                  </select>
                </div>

                <div className="pt-3 border-t border-slate-150 space-y-2">
                  <label className="block text-xs font-bold text-slate-650 uppercase tracking-wider">Barvy textu</label>
                  <div className="grid grid-cols-2 gap-2 text-[10px] font-semibold text-slate-600">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={fonts.brandColor || '#64748b'}
                        onChange={(e) => setFonts({ ...fonts, brandColor: e.target.value })}
                        className="w-6 h-6 p-0 border border-slate-200 rounded cursor-pointer shrink-0"
                      />
                      <span>Značka</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={fonts.nameColor || '#0f172a'}
                        onChange={(e) => setFonts({ ...fonts, nameColor: e.target.value })}
                        className="w-6 h-6 p-0 border border-slate-200 rounded cursor-pointer shrink-0"
                      />
                      <span>Název</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={fonts.priceColor || '#dc2626'}
                        onChange={(e) => setFonts({ ...fonts, priceColor: e.target.value })}
                        className="w-6 h-6 p-0 border border-slate-200 rounded cursor-pointer shrink-0"
                      />
                      <span>Cena</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={fonts.bodyColor || '#334155'}
                        onChange={(e) => setFonts({ ...fonts, bodyColor: e.target.value })}
                        className="w-6 h-6 p-0 border border-slate-200 rounded cursor-pointer shrink-0"
                      />
                      <span>Text / Info</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Col 3: Alignment Config */}
            <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 space-y-4">
              <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2 pb-2 border-b border-slate-100">
                <LayoutGrid className="w-4 h-4 text-indigo-500" />
                Rozměry a okraje (mm)
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="block text-[10px] text-slate-400 font-bold uppercase mb-0.5">Šířka štítku</span>
                  <input
                    type="number"
                    step="0.05"
                    value={layout.labelWidth}
                    onChange={(e) => setLayout({ ...layout, labelWidth: parseFloat(e.target.value) || 63.5 })}
                    className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-center"
                  />
                </div>
                <div>
                  <span className="block text-[10px] text-slate-400 font-bold uppercase mb-0.5">Výška štítku</span>
                  <input
                    type="number"
                    step="0.05"
                    value={layout.labelHeight}
                    onChange={(e) => setLayout({ ...layout, labelHeight: parseFloat(e.target.value) || 38.1 })}
                    className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-center"
                  />
                </div>
                <div>
                  <span className="block text-[10px] text-slate-400 font-bold uppercase mb-0.5">Horní okraj</span>
                  <input
                    type="number"
                    step="0.05"
                    value={layout.topMargin}
                    onChange={(e) => setLayout({ ...layout, topMargin: parseFloat(e.target.value) || 15.15 })}
                    className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-center"
                  />
                </div>
                <div>
                  <span className="block text-[10px] text-slate-400 font-bold uppercase mb-0.5">Levý okraj</span>
                  <input
                    type="number"
                    step="0.05"
                    value={layout.leftMargin}
                    onChange={(e) => setLayout({ ...layout, leftMargin: parseFloat(e.target.value) || 7.25 })}
                    className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-center"
                  />
                </div>
                <div>
                  <span className="block text-[10px] text-slate-400 font-bold uppercase mb-0.5">Vodorovná mezera</span>
                  <input
                    type="number"
                    step="0.05"
                    value={layout.horizontalGap}
                    onChange={(e) => setLayout({ ...layout, horizontalGap: parseFloat(e.target.value) || 2.5 })}
                    className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-center"
                  />
                </div>
                <div>
                  <span className="block text-[10px] text-slate-400 font-bold uppercase mb-0.5">Svislá mezera</span>
                  <input
                    type="number"
                    step="0.05"
                    value={layout.verticalGap}
                    onChange={(e) => setLayout({ ...layout, verticalGap: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-center"
                  />
                </div>
                <div className="col-span-2 bg-indigo-50/60 rounded-lg px-3 py-2 flex items-center justify-between">
                  <span className="text-[10px] text-indigo-700 font-bold uppercase">Vypočteno: {layout.columns} × {layout.rows} = {layout.columns * layout.rows} štítků na arch</span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-150 space-y-3">
                <div>
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={layout.dualLayout || false}
                      onChange={(e) => setLayout({
                        ...layout,
                        dualLayout: e.target.checked,
                        sixIconsLayout: e.target.checked ? false : layout.sixIconsLayout
                      })}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4.5 h-4.5 shrink-0"
                    />
                    <span className="text-xs font-semibold text-slate-700">Duplikovat obsah (2×)</span>
                  </label>
                </div>
                <div>
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={layout.sixIconsLayout || false}
                      onChange={(e) => setLayout({
                        ...layout,
                        sixIconsLayout: e.target.checked,
                        dualLayout: e.target.checked ? false : layout.dualLayout
                      })}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4.5 h-4.5 shrink-0"
                    />
                    <span className="text-xs font-semibold text-slate-700">Šablona na ikony (mřížka 2×3)</span>
                  </label>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-400 font-bold uppercase mb-1">Orientace textu</span>
                  <select
                    value={layout.labelRotation || 0}
                    onChange={(e) => setLayout({ ...layout, labelRotation: parseInt(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs bg-white focus:outline-none"
                  >
                    <option value={0}>Na šířku (0°)</option>
                    <option value={90}>Na výšku (90°)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Custom Icons Section */}
            <div className="md:col-span-3 bg-slate-50/50 p-5 rounded-2xl border border-slate-100 space-y-4">
              <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2 pb-2 border-b border-slate-100">
                <LayoutGrid className="w-4 h-4 text-indigo-500" />
                Vlastní ikony na štítku
              </h4>
              
              <div className="flex flex-col md:flex-row gap-6 items-start">
                {/* Upload box */}
                <div className="shrink-0">
                  <label className="flex flex-col items-center justify-center w-32 h-32 border-2 border-slate-200 border-dashed rounded-xl cursor-pointer bg-white hover:bg-slate-50 hover:border-indigo-400 transition-all">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center px-2">
                      <Plus className="w-6 h-6 text-slate-400 mb-1" />
                      <span className="text-[10px] text-slate-650 font-bold uppercase tracking-wider">Nahrát ikonu</span>
                      <span className="text-[9px] text-slate-400 mt-1">PNG, JPG (max 1MB)</span>
                    </div>
                    <input
                      type="file"
                      accept="image/png, image/jpeg, image/jpg"
                      className="hidden"
                      onChange={handleIconUpload}
                    />
                  </label>
                </div>

                {/* Icons list */}
                <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {layout.customIcons && layout.customIcons.length > 0 ? (
                    layout.customIcons.map((icon: any, idx: number) => (
                      <div key={icon.id || idx} className="flex gap-4 p-4 bg-white border border-slate-150 rounded-xl relative group hover:border-slate-300 transition-all animate-in fade-in zoom-in-95 duration-155">
                        <button
                          type="button"
                          onClick={() => handleRemoveIcon(icon.id)}
                          className="absolute top-2 right-2 text-slate-400 hover:text-rose-600 rounded-lg p-1 transition-colors"
                          title="Smazat ikonu"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>

                        <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-center shrink-0 overflow-hidden p-1">
                          <img src={icon.imageData} alt={icon.name} className="max-w-full max-h-full object-contain" />
                        </div>

                        <div className="flex-1 min-w-0 space-y-2">
                          <div>
                            <span className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Název ikony</span>
                            <input
                              type="text"
                              value={icon.name}
                              onChange={(e) => handleUpdateIcon(icon.id, 'name', e.target.value)}
                              className="w-full rounded border border-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700 focus:outline-none focus:border-indigo-500"
                              placeholder="CE mark apod."
                            />
                          </div>

                           <div className="space-y-2">
                            <div>
                              <span className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Pozice</span>
                              {layout.sixIconsLayout && icon.fillAllCells ? (
                                <div className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded px-2 py-1 select-none">
                                  Všechna políčka (2×3)
                                </div>
                              ) : (
                                <select
                                  value={icon.position}
                                  onChange={(e) => handleUpdateIcon(icon.id, 'position', e.target.value)}
                                  className="w-full rounded border border-slate-200 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700 bg-white focus:outline-none focus:border-indigo-500"
                                >
                                  <option value="top-left">Vlevo nahoře</option>
                                  <option value="top-right">Vpravo nahoře</option>
                                  <option value="top-center">Nahoře uprostřed</option>
                                  <option value="bottom-left">Vlevo dole</option>
                                  <option value="bottom-right">Vpravo dole</option>
                                  <option value="bottom-center">Dole uprostřed</option>
                                  <option value="middle-left">Vlevo uprostřed</option>
                                  <option value="middle-right">Vpravo uprostřed</option>
                                  <option value="center">Na střed</option>
                                </select>
                              )}
                              {layout.sixIconsLayout && (
                                <label className="flex items-center gap-1.5 cursor-pointer mt-1.5 select-none">
                                  <input
                                    type="checkbox"
                                    checked={icon.fillAllCells || false}
                                    onChange={(e) => handleUpdateIcon(icon.id, 'fillAllCells', e.target.checked)}
                                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                                  />
                                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">Vyplnit do všech polí</span>
                                </label>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <span className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-0.5" title="Šířka v mm">Šířka (mm)</span>
                                <input
                                  type="number"
                                  step="0.5"
                                  value={icon.iconWidth}
                                  onChange={(e) => handleUpdateIcon(icon.id, 'iconWidth', parseFloat(e.target.value) || 5)}
                                  className="w-full rounded border border-slate-200 px-1.5 py-0.5 text-xs text-center font-semibold text-slate-750 focus:outline-none focus:border-indigo-500"
                                />
                              </div>
                              <div>
                                <span className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-0.5" title="Výška v mm">Výška (mm)</span>
                                <input
                                  type="number"
                                  step="0.5"
                                  value={icon.iconHeight}
                                  onChange={(e) => handleUpdateIcon(icon.id, 'iconHeight', parseFloat(e.target.value) || 5)}
                                  className="w-full rounded border border-slate-200 px-1.5 py-0.5 text-xs text-center font-semibold text-slate-750 focus:outline-none focus:border-indigo-500"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex items-center justify-center border border-dashed border-slate-200 rounded-xl p-8 bg-slate-50 text-slate-400 text-xs font-semibold min-h-[128px]">
                      Nebyly přidány žádné vlastní ikony.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditingTemplate(null)}
              className="text-sm font-semibold text-slate-550 px-4 py-2 hover:bg-slate-50 border border-slate-150 rounded-xl"
            >
              Zrušit
            </button>
            <button
              type="submit"
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-6 py-2 rounded-xl flex items-center gap-2 disabled:opacity-50"
            >
              {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
              Uložit šablonu
            </button>
          </div>
        </form>

        {/* Pravý sticky sloupec pro vizuální náhled */}
        <div 
          className="lg:col-span-4 bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-4"
          style={{ position: 'sticky', top: '24px', alignSelf: 'start', height: 'fit-content' }}
        >
          <h3 className="font-bold text-sm text-slate-900 uppercase tracking-wider mb-2 flex items-center justify-center gap-2 pb-3 border-b border-slate-100">
            <Palette className="w-4 h-4 text-indigo-500" />
            Živý vizuální náhled
          </h3>
          <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100 shadow-inner flex items-center justify-center min-h-[220px]">
            <LabelPreview fields={fields} fonts={fonts} layout={layout} product={previewProduct} />
          </div>
          <div className="text-xs text-slate-550 font-bold space-y-1 text-center bg-slate-50 py-2 rounded-xl border border-slate-100">
            <div>Rozměr: {layout.labelWidth} × {layout.labelHeight} mm</div>
            <div>Uspořádání: {layout.columns} × {layout.rows} na arch A4</div>
          </div>
          <p className="text-[10px] text-slate-400 text-center leading-normal">
            Tento náhled je orientační. Výsledné tiskové PDF bude vygenerováno přesně podle rozměrů šablony.
          </p>
        </div>
      </div>
    )}

      {/* TEMPLATES LIST GRID */}
      {loading && templates.length === 0 ? (
        <div className="py-20 text-center bg-white rounded-2xl border border-slate-100">
          <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-500">Načítání uložených šablon...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((temp) => {
            const fieldsObj = JSON.parse(temp.fieldsConfig);
            const fontObj = JSON.parse(temp.fontConfig);
            const layoutObj = JSON.parse(temp.layoutConfig);

            return (
              <div
                key={temp.id}
                draggable={!editingTemplate}
                onDragStart={(e) => handleDragStart(e, temp.id)}
                onDragOver={(e) => handleDragOver(e, temp.id)}
                onDragEnd={handleDragEnd}
                className={`bg-white rounded-2xl border ${
                  draggedId === temp.id
                    ? 'border-dashed border-indigo-400 opacity-50 scale-95'
                    : 'border-slate-100'
                } shadow-sm p-6 relative overflow-hidden group hover:shadow-md transition-all duration-200`}
              >
                {/* Top action/drag handle row */}
                <div className="flex items-center justify-between mb-3 text-slate-400">
                  <div
                    className="flex items-center gap-1 cursor-grab active:cursor-grabbing text-slate-350 hover:text-slate-650 transition-colors"
                    title="Přetáhněte pro změnu pořadí"
                  >
                    <GripVertical className="w-4 h-4 shrink-0" />
                    <span className="text-[11px] font-bold select-none">Pořadí</span>
                  </div>

                  {/* Default template action/indicator */}
                  {temp.isDefault ? (
                    <div className="flex items-center gap-1 text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full text-[10px] font-bold">
                      <Star className="w-3 h-3 fill-current text-amber-500" />
                      <span>Výchozí</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      draggable="false"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSetDefault(temp.id);
                      }}
                      className="flex items-center gap-1 text-slate-400 hover:text-amber-600 hover:bg-amber-50/50 border border-transparent hover:border-amber-150 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all"
                      title="Nastavit jako výchozí"
                    >
                      <Star className="w-3 h-3 text-slate-400 hover:text-amber-500" />
                      <span>Nastavit výchozí</span>
                    </button>
                  )}
                </div>

                {/* Visual Label representation inside the card */}
                <div className="h-10 bg-slate-50/50 rounded-xl border border-slate-100 flex items-center px-3 gap-2 mb-4 justify-between">
                  <span className="text-[10px] font-bold text-slate-400">
                    Rozměr: {layoutObj.labelWidth}x{layoutObj.labelHeight} mm
                  </span>
                  <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                    {layoutObj.columns}x{layoutObj.rows} štítků
                  </span>
                </div>

                <h3 className="font-bold text-slate-900 text-base group-hover:text-indigo-600 transition-colors mb-1 truncate">
                  {temp.name}
                </h3>
                <p className="text-xs text-slate-400 font-medium mb-4">
                  Okraje: H {layoutObj.topMargin}mm, L {layoutObj.leftMargin}mm, mezera: {layoutObj.horizontalGap}mm
                </p>

                <div className="space-y-1.5 text-xs text-slate-500 font-semibold mb-6">
                  <div>
                    Zobrazuje: {[
                      fieldsObj.showName && 'Název',
                      fieldsObj.showSku && 'SKU',
                      fieldsObj.showPrice && 'Cena',
                      fieldsObj.showSafetyText && 'Bezpečnost'
                    ].filter(Boolean).join(', ')}
                  </div>
                  <div>
                    Písma: Název {fontObj.nameFontSize}pt, Tělo {fontObj.bodyFontSize}pt
                  </div>
                </div>

                <div className="flex gap-2 justify-end border-t border-slate-50 pt-4">
                  <button
                    type="button"
                    draggable="false"
                    onClick={() => handleEditClick(temp)}
                    className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 px-3 py-1.5 hover:bg-indigo-50 rounded-lg transition-colors"
                    title="Upravit šablonu"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Upravit
                  </button>
                  <button
                    type="button"
                    draggable="false"
                    onClick={() => handleDuplicateClick(temp.id)}
                    className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 hover:text-emerald-800 px-3 py-1.5 hover:bg-emerald-50 rounded-lg transition-colors"
                    title="Duplikovat šablonu"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Duplikovat
                  </button>
                  {templates.length > 1 && (
                    <button
                      type="button"
                      draggable="false"
                      onClick={() => setShowDeleteConfirm(temp.id)}
                      className="flex items-center gap-1.5 text-xs font-bold text-rose-600 hover:text-rose-800 px-3 py-1.5 hover:bg-rose-50 rounded-lg transition-colors"
                      title="Smazat šablonu"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Smazat
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* DELETE CONFIRM MODAL */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl p-6 border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-rose-600 mb-4">
              <Trash2 className="w-6 h-6 shrink-0" />
              <h3 className="font-bold text-lg">Smazat šablonu?</h3>
            </div>
            <p className="text-sm text-slate-500 mb-6">
              Opravdu si přejete smazat tuto šablonu vzhledu? Tiskové nastavení pro tuto šablonu bude trvale odstraněno.
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
    </div>
  );
}
