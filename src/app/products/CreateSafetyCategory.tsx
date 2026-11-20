'use client';
import { useState } from 'react';
import { createSafetyCategoryAction } from '@/app/actions';

type Created = Extract<Awaited<ReturnType<typeof createSafetyCategoryAction>>, { ok: true }>;
export default function CreateSafetyCategory({ onCreated }: { onCreated: (category: Created) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [area, setArea] = useState('Ostatní');
  const [safetyText, setSafetyText] = useState('');
  const [keywords, setKeywords] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    setBusy(true); setError('');
    try {
      const result = await createSafetyCategoryAction({ name, area, safetyText, keywords });
      if (!result.ok) { setError(result.error); return; }
      onCreated(result); setOpen(false);
    } catch { setError('Kategorii se nepodařilo uložit. Zkuste to znovu.'); }
    finally { setBusy(false); }
  }
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="text-indigo-700 underline font-semibold">Chybí vhodná kategorie? Vytvořit novou</button>;
  return <div className="rounded-lg border border-indigo-200 bg-white p-3 space-y-3 text-slate-800" role="group" aria-label="Nová bezpečnostní kategorie">
    <h3 className="font-bold">Nová kategorie výrobku</h3>
    <p>Kategorie bude dostupná všem uživatelům aplikace. Text vyplňte podle podkladů k výrobku.</p>
    <label className="block">Název kategorie<input value={name} onChange={e => setName(e.target.value)} maxLength={100} placeholder="Např. Kosmetická zrcátka" className="mt-1 w-full rounded border border-slate-300 p-2" /></label>
    <label className="block">Oblast<input value={area} onChange={e => setArea(e.target.value)} maxLength={80} className="mt-1 w-full rounded border border-slate-300 p-2" /></label>
    <label className="block">Bezpečnostní text<textarea value={safetyText} onChange={e => setSafetyText(e.target.value)} maxLength={4000} rows={4} className="mt-1 w-full rounded border border-slate-300 p-2" /></label>
    <label className="block">Rozpoznávací slova nebo spojení (nepovinné)<input value={keywords} onChange={e => setKeywords(e.target.value)} maxLength={2000} placeholder="zrcátko, zrcadlo, mirror" className="mt-1 w-full rounded border border-slate-300 p-2" /></label>
    <p className="text-slate-500">Oddělte čárkou. Shoda kteréhokoliv slova v názvu nabídne tuto kategorii i dalším produktům. Bez slov se vybírá ručně.</p>
    {error && <p role="alert" className="text-rose-700">{error}</p>}
    <div className="flex flex-wrap gap-3">
      <button type="button" disabled={busy || name.trim().length < 2 || safetyText.trim().length < 10} onClick={save} className="rounded-lg bg-indigo-600 text-white px-3 py-2 font-semibold disabled:opacity-50">{busy ? 'Ukládám...' : 'Vytvořit kategorii a zobrazit návrh'}</button>
      <button type="button" disabled={busy} onClick={() => setOpen(false)} className="underline">Zrušit</button>
    </div>
    <p className="text-slate-500">Vytvoření kategorie zatím nepřepíše text produktu. Návrh použijte a produkt uložte.</p>
  </div>;
}
