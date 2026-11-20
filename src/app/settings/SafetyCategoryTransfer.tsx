'use client';
import { useId, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, FileSpreadsheet, FileCheck2, LoaderCircle } from 'lucide-react';
import MaintenanceDialog from '@/components/MaintenanceDialog';
import type { planSafetyWorkbookImport } from '@/lib/safetyWorkbook';

type Preview = Omit<ReturnType<typeof planSafetyWorkbookImport>, 'catalog'>;
export default function SafetyCategoryTransfer() {
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function submit(selected: File, apply = false) {
    if (apply && (!preview || !confirmed)) return;
    setBusy(true); setError(''); setMessage('');
    try {
      if (!selected.name.toLowerCase().endsWith('.xlsx') || selected.size > 2 * 1024 * 1024 || !selected.size) throw new Error('Vyberte neprázdný soubor .xlsx do velikosti 2 MB.');
      const data = new FormData(); data.set('file', selected); data.set('mode', apply ? 'apply' : 'preview');
      if (apply && preview) data.set('token', preview.token);
      const response = await fetch('/api/safety-categories', { method: 'POST', body: data });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Import se nezdařil.');
      if (apply) { setMessage(`Import dokončen. Přidáno: ${result.added}, aktualizováno: ${result.updated}. Texty u produktů se nezměnily.`); setPreview(null); setConfirmed(false); setFile(null); }
      else { setPreview(result); setConfirmed(false); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Import se nezdařil.'); setPreview(null); setConfirmed(false); }
    finally { setBusy(false); }
  }
  async function download() {
    setExporting(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/safety-categories');
      if (!response.ok) { const result = await response.json(); throw new Error(result.error || 'Export se nezdařil.'); }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = `stitkovac_kategorie_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) { setError(e instanceof Error ? e.message : 'Export se nezdařil.'); }
    finally { setExporting(false); }
  }
  return <section className="rounded-xl border border-slate-200 bg-white px-5 py-4" aria-label="Import a export bezpečnostních kategorií">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3"><div className="rounded-lg bg-slate-100 p-2.5 text-slate-500"><FileSpreadsheet className="h-5 w-5" /></div>
        <div><h2 className="text-sm font-bold text-slate-800">Kategorie a bezpečnostní texty</h2><p className="mt-0.5 text-xs text-slate-500">Přenos kategorií a pravidel v Excelu, včetně vlastních.</p></div></div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={exporting} onClick={download} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">{exporting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}Exportovat Excel</button>
        <button type="button" onClick={() => { setOpen(true); setFile(null); setPreview(null); setConfirmed(false); setError(''); setMessage(''); }} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-indigo-300 hover:text-indigo-700"><ArrowUpFromLine className="h-4 w-4" />Importovat Excel</button>
      </div>
    </div>
    {!open && error && <p role="alert" className="mt-3 text-xs text-rose-700">{error}</p>}
    <MaintenanceDialog open={open} title="Import kategorií z Excelu" busy={busy} onClose={() => setOpen(false)}>
      <p className="text-slate-500 leading-relaxed">Vyberte upravený export. Nejprve zobrazíme náhled, do potvrzení se nic nezmění.</p>
      <label htmlFor={inputId} className={`relative flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50/40 px-4 py-6 text-center transition-colors hover:border-indigo-400 hover:bg-indigo-50 ${busy ? 'opacity-50' : ''}`}>
        <FileSpreadsheet className="h-7 w-7 text-indigo-500" />
        <span className="max-w-full break-all font-semibold text-indigo-700">{file ? file.name : 'Vybrat soubor Excel'}</span>
        <span className="text-xs text-slate-400">.xlsx, maximálně 2 MB{file ? ' - kliknutím změníte soubor' : ''}</span>
        <input id={inputId} aria-label="Vybrat soubor Excel" type="file" accept=".xlsx" disabled={busy} className="absolute inset-0 h-full w-full cursor-pointer opacity-0 focus:opacity-10" onChange={e => {
          const selected = e.target.files?.[0]; e.target.value = '';
          if (!selected) return;
          setFile(selected); setPreview(null); setConfirmed(false); void submit(selected);
        }} />
      </label>
      {busy && <p role="status" className="flex items-center gap-2 text-indigo-700"><LoaderCircle className="h-4 w-4 animate-spin" />{preview ? 'Importuji kategorie...' : 'Kontroluji soubor...'}</p>}
      {error && <div role="alert" className="rounded-lg bg-rose-50 p-3 text-rose-700">{error}{file && <button type="button" disabled={busy} onClick={() => submit(file)} className="ml-2 font-semibold underline">Zkusit znovu</button>}</div>}
      {message && <p role="status" className="flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-emerald-800"><FileCheck2 className="h-5 w-5 shrink-0" />{message}</p>}
      {preview && <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2" role="status">{[['Nové kategorie', preview.added], ['Aktualizace', preview.updated], ['Beze změny', preview.unchanged], ['Zachované mimo soubor', preview.kept]].map(([label, count]) => <div key={label} className="rounded-xl bg-slate-50 p-3"><span className="block text-xs text-slate-500">{label}</span><strong className="text-xl text-slate-900">{count}</strong></div>)}</div>
        <p className="text-xs text-slate-500">{preview.rulesReplaced ? 'Pravidla importovaných kategorií se nahradí.' : 'Současná pravidla se zachovají.'} Počet pravidel po importu: {preview.rules}.</p>
        {preview.sample.length > 0 && <details className="text-xs text-slate-600"><summary className="cursor-pointer font-semibold">Ukázka změn (max. 20)</summary><ul className="mt-2 max-h-40 overflow-y-auto space-y-1">{preview.sample.map(item => <li key={item.code}>{item.change}: {item.name} ({item.code})</li>)}</ul></details>}
        <label className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600"><input type="checkbox" disabled={busy} checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-0.5" />Potvrzuji import kategorií a pravidel. Původní katalog se zálohuje. Texty u produktů se nezmění.</label>
        <button type="button" disabled={busy || !confirmed} onClick={() => file && submit(file, true)} className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40">Potvrdit import</button>
      </div>}
      <details className="text-xs text-slate-400"><summary className="cursor-pointer">Jak soubor připravit</summary><p className="mt-2 leading-relaxed">Nejprve si stáhněte export. Zachovejte kódy kategorií a hlavičky sloupců. Kategorie chybějící v souboru se nemažou. Přenos je dostupný správci.</p></details>
    </MaintenanceDialog>
  </section>;
}
