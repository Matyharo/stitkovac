import Link from 'next/link';
import { prisma } from '@/lib/db';
import {
  FileSpreadsheet,
  Printer,
  Package,
  Palette,
  Calendar,
  Layers,
  CheckCircle,
  Clock,
  ArrowRight,
  AlertCircle,
  RefreshCw
} from 'lucide-react';

export const revalidate = 0; // Disable caching so dashboard is always fresh

export default async function DashboardPage() {
  // Fetch statistics
  const productCount = await prisma.product.count();
  const templateCount = await prisma.labelTemplate.count();
  const printJobCount = await prisma.printJob.count();
  const recentJobs = await prisma.printJob.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  // Database health stats
  const missingPriceCount = await prisma.product.count({
    where: { OR: [{ price: null }, { price: { lte: 0 } }] }
  });
  const missingSafetyCount = await prisma.product.count({
    where: { OR: [{ safetyText: null }, { safetyText: '' }] }
  });
  const missingContactCount = await prisma.product.count({
    where: { OR: [{ contactText: null }, { contactText: '' }] }
  });
  const missingEanCount = await prisma.product.count({
    where: { OR: [{ ean: null }, { ean: '' }] }
  });

  const incompleteCount = await prisma.product.count({
    where: {
      OR: [
        { price: null },
        { price: { lte: 0 } },
        { safetyText: null },
        { safetyText: '' },
        { contactText: null },
        { contactText: '' },
        { ean: null },
        { ean: '' }
      ]
    }
  });

  const incompleteSamples = await prisma.product.findMany({
    where: {
      OR: [
        { price: null },
        { price: { lte: 0 } },
        { safetyText: null },
        { safetyText: '' },
        { contactText: null },
        { contactText: '' },
        { ean: null },
        { ean: '' }
      ]
    },
    take: 3,
    select: {
      id: true,
      sku: true,
      name: true,
      price: true,
      safetyText: true,
      contactText: true,
      ean: true
    }
  });

  return (
    <div className="flex-1 p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
            Přehled systému
          </h1>
          <p className="text-slate-500 mt-1">
            Vítejte ve správě samolepicích štítků. Zde můžete spravovat katalogy a připravovat tiskové úlohy.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/print"
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-medium shadow-md shadow-indigo-600/10 transition-all duration-200"
          >
            <Printer className="w-4 h-4" />
            Nová tisková úloha
          </Link>
        </div>
      </div>

      {/* Stats Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Card 1: Products */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
              Celkem produktů
            </span>
            <div className="p-3 rounded-xl bg-blue-50 text-blue-600 group-hover:bg-blue-100 transition-colors">
              <Package className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-900">{productCount}</span>
            <span className="text-xs text-slate-500 font-medium">aktivních</span>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-50">
            <Link
              href="/products"
              className="text-xs text-blue-600 hover:text-blue-800 font-semibold inline-flex items-center gap-1 group/link"
            >
              Zobrazit katalog
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover/link:translate-x-0.5" />
            </Link>
          </div>
        </div>

        {/* Card 2: Templates */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
              Šablony vzhledu
            </span>
            <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100 transition-colors">
              <Palette className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-900">{templateCount}</span>
            <span className="text-xs text-slate-500 font-medium">připravených stylů</span>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-50">
            <Link
              href="/templates"
              className="text-xs text-emerald-600 hover:text-emerald-800 font-semibold inline-flex items-center gap-1 group/link"
            >
              Spravovat šablony
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover/link:translate-x-0.5" />
            </Link>
          </div>
        </div>

        {/* Card 3: Print Jobs */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
              Tiskové úlohy
            </span>
            <div className="p-3 rounded-xl bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100 transition-colors">
              <Printer className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-900">{printJobCount}</span>
            <span className="text-xs text-slate-500 font-medium">vygenerovaných archů</span>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-50">
            <Link
              href="/print"
              className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold inline-flex items-center gap-1 group/link"
            >
              Spustit generátor
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover/link:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Main Grid: Quick Actions & Print History */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Col: Recent Print Jobs (2/3 width) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-indigo-500" />
            Historie posledních tisků
          </h2>

          {recentJobs.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-slate-200 rounded-xl">
              <Printer className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500">Zatím nebyly vygenerovány žádné štítky.</p>
              <Link
                href="/print"
                className="mt-3 inline-block text-xs font-semibold text-indigo-600 hover:underline"
              >
                Vytvořit první tiskový arch
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentJobs.map((job) => {
                const jobProducts = JSON.parse(job.products) as {
                  name: string;
                  sku: string;
                  quantity: number;
                }[];
                const totalLabels = jobProducts.reduce((sum, p) => sum + p.quantity, 0);

                return (
                  <div key={job.id} className="py-4 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">
                          Tisk #{(job.id).substring(0, 8)}
                        </span>
                        <span className="text-[11px] font-medium px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
                          Start. pozice: {job.startPosition}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 truncate max-w-md">
                        {jobProducts.map((p) => `${p.name} (${p.quantity}ks)`).join(', ')}
                      </p>
                    </div>
                    <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                      <div className="text-right">
                        <span className="text-sm font-bold text-slate-900 block">
                          {totalLabels} {totalLabels === 1 ? 'štítek' : totalLabels < 5 ? 'štítky' : 'štítků'}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium inline-flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(job.createdAt).toLocaleString('cs-CZ', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </span>
                      </div>
                      <Link
                        href={`/print?loadJob=${job.id}`}
                        className="flex items-center gap-1.5 text-xs font-bold text-indigo-650 hover:text-indigo-850 px-3 py-1.5 bg-indigo-50/50 hover:bg-indigo-50 border border-indigo-100 rounded-xl transition-all"
                        title="Načíst celou dávku znovu do tiskové fronty"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Zopakovat
                      </Link>
                      <span className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                        <CheckCircle className="w-4 h-4" />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Col: Quick Guidance / Tools (1/3 width) */}
        <div className="space-y-6">
          {/* Quick Actions Panel */}
          <div className="bg-slate-900 text-slate-200 rounded-2xl p-6 relative overflow-hidden shadow-sm">
            <div className="absolute -right-10 -bottom-10 opacity-10 text-white">
              <Printer className="w-40 h-40" />
            </div>
            <h3 className="font-bold text-lg text-white mb-2">Rychlý start</h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-6">
              Vytiskněte etikety ve 3 jednoduchých krocích: nahrajte data, zkontrolujte chybějící detaily a vygenerujte PDF.
            </p>

            <div className="space-y-3">
              <Link
                href="/import"
                className="flex items-center gap-3 px-4 py-3 bg-slate-800/80 hover:bg-slate-800 border border-slate-750 hover:border-slate-700 rounded-xl text-sm font-semibold transition-all duration-200"
              >
                <FileSpreadsheet className="w-4 h-4 text-indigo-400" />
                1. Nahrát CSV / Excel
              </Link>
              <Link
                href="/products"
                className="flex items-center gap-3 px-4 py-3 bg-slate-800/80 hover:bg-slate-800 border border-slate-750 hover:border-slate-700 rounded-xl text-sm font-semibold transition-all duration-200"
              >
                <Package className="w-4 h-4 text-emerald-400" />
                2. Spravovat produkty
              </Link>
              <Link
                href="/print"
                className="flex items-center gap-3 px-4 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition-all duration-200"
              >
                <Printer className="w-4 h-4 text-indigo-100" />
                3. Tisk na arch A4
              </Link>
            </div>
          </div>

          {/* Card: Kontrola dat katalogu */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
            <h3 className="font-bold text-sm text-slate-900 uppercase tracking-wider mb-2 flex items-center gap-2 pb-3 border-b border-slate-100">
              {incompleteCount === 0 ? (
                <CheckCircle className="w-4.5 h-4.5 text-emerald-500" />
              ) : (
                <AlertCircle className="w-4.5 h-4.5 text-amber-500" />
              )}
              Kontrola dat katalogu
            </h3>
            
            {incompleteCount === 0 ? (
              <div className="flex items-center gap-2 text-emerald-700 text-xs font-semibold bg-emerald-50/50 p-3.5 rounded-xl border border-emerald-100">
                <span>Všechna data jsou kompletní! Katalog je 100% připraven k tisku.</span>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-amber-50 text-amber-850 rounded-xl p-3 text-xs font-semibold border border-amber-100 leading-normal">
                  Nalezeno {incompleteCount} produktů s neúplnými údaji pro tisk.
                </div>
                
                <div className="space-y-2.5">
                  <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider">Detaily chybějících dat:</span>
                  <div className="space-y-1.5 text-xs text-slate-600 font-semibold">
                    {missingPriceCount > 0 && (
                      <div className="flex justify-between">
                        <span>Chybějící cena:</span>
                        <span className="font-bold text-slate-700">{missingPriceCount} ks</span>
                      </div>
                    )}
                    {missingSafetyCount > 0 && (
                      <div className="flex justify-between">
                        <span>Chybějící bezp. text:</span>
                        <span className="font-bold text-slate-700">{missingSafetyCount} ks</span>
                      </div>
                    )}
                    {missingContactCount > 0 && (
                      <div className="flex justify-between">
                        <span>Chybějící kontakt:</span>
                        <span className="font-bold text-slate-700">{missingContactCount} ks</span>
                      </div>
                    )}
                    {missingEanCount > 0 && (
                      <div className="flex justify-between">
                        <span>Chybějící EAN kód:</span>
                        <span className="font-bold text-slate-700">{missingEanCount} ks</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100">
                  <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">Ukázka chybějících položek:</span>
                  <div className="space-y-2">
                    {incompleteSamples.map((p) => {
                      const issues = [];
                      if (p.price === null || p.price <= 0) issues.push('cena');
                      if (!p.safetyText) issues.push('bezp. text');
                      if (!p.contactText) issues.push('kontakt');
                      if (!p.ean) issues.push('EAN');

                      return (
                        <div key={p.id} className="flex justify-between items-center text-xs p-2.5 bg-slate-50 rounded-xl border border-slate-100/50">
                          <div className="min-w-0 pr-2">
                            <span className="font-bold text-slate-800 block truncate" title={p.name}>{p.name}</span>
                            <span className="text-[9px] text-slate-400 font-mono font-bold">SKU: {p.sku}</span>
                          </div>
                          <span className="text-[9px] bg-rose-50 border border-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-bold shrink-0 whitespace-nowrap">
                            Chybí: {issues.join(', ')}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Label Specs Information */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="font-bold text-sm text-slate-900 uppercase tracking-wider mb-4">
              Specifikace etiket
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs pb-2.5 border-b border-slate-50">
                <span className="text-slate-500 font-medium">Typ archu:</span>
                <span className="font-semibold text-slate-800">A4 Spoko S060630380</span>
              </div>
              <div className="flex items-center justify-between text-xs pb-2.5 border-b border-slate-50">
                <span className="text-slate-500 font-medium">Uspořádání:</span>
                <span className="font-semibold text-slate-800">3 sloupce × 7 řádků (21ks)</span>
              </div>
              <div className="flex items-center justify-between text-xs pb-2.5 border-b border-slate-50">
                <span className="text-slate-500 font-medium">Rozměr štítku:</span>
                <span className="font-semibold text-slate-800">63,5 × 38,1 mm</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium">Ekvivalent rozměru:</span>
                <span className="font-semibold text-slate-800">Avery Zweckform L7160</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
