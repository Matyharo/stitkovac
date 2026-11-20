'use client';
import { useState } from 'react';
import MaintenanceDialog from '@/components/MaintenanceDialog';
type Category = { code: string; productType: string; area: string; safetyText: string; mode: string };
export default function SafetyCategoryEditor() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Category[]>([]);
  const [selected, setSelected] = useState<Category | null>(null);
  const [version, setVersion] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function load() {
    setBusy(true); setMessage('');
    try { const response = await fetch('/api/safety-categories?format=json'); const data = await response.json(); if (!response.ok) throw new Error(data.error); setEntries(data.templates); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Kategorie se nepodařilo načíst.'); }
    finally { setBusy(false); }
  }
  return <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
    <button type="button" className="font-semibold text-indigo-700" onClick={() => { setOpen(true); setSelected(null); void load(); }}>Upravit bezpečnostní kategorie</button>
    <p className="mt-1 text-xs text-slate-500">Názvy, texty a režim ručního posouzení.</p>
    <MaintenanceDialog open={open} title="Bezpečnostní kategorie" busy={busy} onClose={() => setOpen(false)}>
      <label className="block text-sm">Kategorie<select disabled={busy} className="mt-1 w-full rounded-lg border border-slate-200 p-2" value={selected?.code || ''} onChange={event => { const category = entries.find(entry => entry.code === event.target.value) || null; setSelected(category ? { ...category } : null); setVersion(JSON.stringify(category)); setMessage(''); }}><option value="">Vyberte kategorii</option>{entries.filter(entry => entry.code !== 'NEURCENO').map(entry => <option key={entry.code} value={entry.code}>{entry.productType}</option>)}</select></label>
      {selected && <form className="mt-4 space-y-3" onSubmit={async event => {
        event.preventDefault(); setBusy(true); setMessage('');
        try { const response = await fetch('/api/safety-categories', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: selected.code, name: selected.productType, area: selected.area, safetyText: selected.safetyText, mode: selected.mode, version }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); await load(); setSelected(null); setMessage('Kategorie uložena. Existující texty produktů zůstaly zachovány.'); }
        catch (error) { setMessage(error instanceof Error ? error.message : 'Uložení se nezdařilo.'); } finally { setBusy(false); }
      }}>
        <label className="block text-sm">Název<input required minLength={2} maxLength={100} className="mt-1 w-full rounded-lg border p-2" value={selected.productType} onChange={event => setSelected({ ...selected, productType: event.target.value })} /></label>
        <label className="block text-sm">Oblast<input maxLength={80} className="mt-1 w-full rounded-lg border p-2" value={selected.area} onChange={event => setSelected({ ...selected, area: event.target.value })} /></label>
        <label className="block text-sm">Bezpečnostní text<textarea required minLength={10} maxLength={4000} rows={6} className="mt-1 w-full rounded-lg border p-2" value={selected.safetyText} onChange={event => setSelected({ ...selected, safetyText: event.target.value })} /></label>
        <label className="block text-sm">Použití<select className="mt-1 w-full rounded-lg border p-2" value={selected.mode} onChange={event => setSelected({ ...selected, mode: event.target.value })}><option>Návrh ke schválení</option><option>Ověřit konkrétní výrobek</option><option>Ruční posouzení</option><option>Přeskočit</option></select></label>
        <p className="text-xs text-slate-500">Ruční posouzení vypne hromadné přiřazování textu této kategorie. Pravidla a již uložené texty se zachovají.</p>
        <button disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-white disabled:opacity-50">Uložit kategorii</button>
      </form>}
      {busy && <p role="status">Zpracovávám...</p>}{message && <p role="status" className="mt-3 text-sm">{message}</p>}
    </MaintenanceDialog>
  </section>;
}
