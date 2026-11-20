'use client';
import { useState } from 'react';
import type { planSafetyWorkbookImport } from '@/lib/safetyWorkbook';

type Preview = Omit<ReturnType<typeof planSafetyWorkbookImport>, 'catalog'>;
export default function SafetyCategoryTransfer() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function submit(apply: boolean) {
    if (!file || (apply && (!preview || !confirmed))) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const data = new FormData(); data.set('file', file); data.set('mode', apply ? 'apply' : 'preview');
      if (apply && preview) data.set('token', preview.token);
      const response = await fetch('/api/safety-categories', { method: 'POST', body: data });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Import se nezdařil.');
      if (apply) { setMessage(`${result.message} Přidáno: ${result.added}, aktualizováno: ${result.updated}.`); setPreview(null); setConfirmed(false); }
      else { setPreview(result); setConfirmed(false); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Import se nezdařil.'); setPreview(null); setConfirmed(false); }
    finally { setBusy(false); }
  }
  return <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4" aria-label="Import a export bezpečnostních kategorií">
    <h2 className="text-lg font-bold text-slate-900">Kategorie a bezpečnostní texty - Excel</h2>
    <p className="text-sm text-slate-600">Export obsahuje všechny aktuální kategorie, včetně vlastních, jejich texty a pravidla rozpoznávání. Import a export je dostupný správci.</p>
    <a href="/api/safety-categories" className="inline-block rounded-lg bg-indigo-600 px-4 py-2 text-white text-sm font-semibold">Exportovat kategorie (.xlsx)</a>
    <p className="text-sm text-slate-600">Pro úpravy nejprve stáhněte export. Zachovejte kódy a hlavičky sloupců. Import přidá nové kategorie a aktualizuje existující podle kódu. Kategorie chybějící v souboru se zachovají.</p>
    <label className="block text-sm font-semibold">Excel s kategoriemi<input type="file" accept=".xlsx" disabled={busy} onChange={e => { setFile(e.target.files?.[0] || null); setPreview(null); setConfirmed(false); setError(''); setMessage(''); }} className="block mt-2 w-full text-sm" /></label>
    <button disabled={busy || !file} onClick={() => submit(false)} className="rounded-lg border border-indigo-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">{busy ? 'Zpracovávám...' : 'Zkontrolovat soubor a zobrazit náhled'}</button>
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    {message && <p role="status" className="text-sm text-emerald-800">{message}</p>}
    {preview && <div className="rounded-xl bg-indigo-50 p-4 space-y-3 text-sm">
      <p role="status">Přidat: <strong>{preview.added}</strong>. Aktualizovat: <strong>{preview.updated}</strong>. Beze změny: {preview.unchanged}. Zachovat mimo soubor: {preview.kept}.</p>
      <p>{preview.rulesReplaced ? 'Pravidla importovaných kategorií se nahradí podle listu Pravidla.' : 'List Pravidla není přítomen - současná pravidla zůstanou zachovaná.'} Počet pravidel po importu: {preview.rules}.</p>
      {preview.sample.length > 0 && <details><summary className="cursor-pointer font-semibold">Ukázka změn (max. 20)</summary><ul className="mt-2 space-y-1">{preview.sample.map(item => <li key={item.code}>{item.change}: {item.name} ({item.code})</li>)}</ul></details>}
      <label className="flex items-start gap-2"><input type="checkbox" disabled={busy} checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />Potvrzuji import kategorií a pravidel. Původní katalog se před změnou zálohuje v databázi. Texty u produktů se nezmění.</label>
      <button disabled={busy || !confirmed} onClick={() => submit(true)} className="rounded-lg bg-indigo-600 px-4 py-2 text-white font-semibold disabled:opacity-50">Importovat kategorie</button>
    </div>}
  </section>;
}
